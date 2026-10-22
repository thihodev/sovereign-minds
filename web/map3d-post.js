// The 3D map's finishing passes (quality "Đẹp"): the scene drawn once into an HDR target, then
// ambient occlusion from its depth (half resolution), a soft bloom of what shines, a tilt-shift blur
// of what lies far before or behind the point looked at, tone mapping and a gentle colour grade.
// Plain WebGL2 passes over one full-screen triangle; no addon needed. Quality "Nhanh" skips all of it.
import * as THREE from "three";

const VS = /* glsl */`
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// gradient noise per pixel (interleaved), to rotate the AO samples and to dither the output
const IGN = /* glsl */`float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }`;

const AO_FS = /* glsl */`
precision highp float;
uniform highp sampler2D tDepth;
uniform mat4 uProjInv;
uniform vec2 uRes;      // the AO target's size in pixels
uniform float uRadius;  // world units
uniform float uPx;      // pixels (of the AO target) per world unit at a distance of 1
uniform float uStrength;
varying vec2 vUv;
${IGN}
vec3 viewPos(vec2 uv) {
  float z = texture2D(tDepth, uv).x;
  vec4 p = uProjInv * vec4(vec3(uv, z) * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}
void main() {
  float z0 = texture2D(tDepth, vUv).x;
  if (z0 >= 0.99999) { gl_FragColor = vec4(1.0); return; }
  vec3 P = viewPos(vUv);
  // the surface's normal from its neighbours, taking the nearer side at each edge (no halos round the towns)
  vec2 px = 1.0 / uRes;
  vec3 r = viewPos(vUv + vec2(px.x, 0.0)) - P, l = P - viewPos(vUv - vec2(px.x, 0.0));
  vec3 u = viewPos(vUv + vec2(0.0, px.y)) - P, d = P - viewPos(vUv - vec2(0.0, px.y));
  vec3 n = normalize(cross(abs(r.z) < abs(l.z) ? r : l, abs(u.z) < abs(d.z) ? u : d));
  float ssR = uPx * uRadius / max(0.001, -P.z);
  if (ssR < 1.0) { gl_FragColor = vec4(1.0); return; }
  ssR = min(ssR, 48.0);
  float rot = 6.2831853 * ign(gl_FragCoord.xy), sum = 0.0, r2 = uRadius * uRadius;
  const int N = 10;
  for (int i = 0; i < N; i++) {
    float a = (float(i) + 0.5) / float(N), ang = a * 21.99 + rot; // a spiral of 3.5 turns
    vec2 off = vec2(cos(ang), sin(ang)) * a * ssR * px;
    vec3 v = viewPos(vUv + off) - P;
    float vv = dot(v, v), vn = dot(v, n) / sqrt(vv + 1e-6);
    sum += max(vn - 0.08, 0.0) * max(1.0 - vv / r2, 0.0);
  }
  gl_FragColor = vec4(vec3(clamp(1.0 - uStrength * sum / float(N), 0.0, 1.0)), 1.0);
}`;

// a small blur of the AO that keeps to its own surface (depth-aware)
const AO_BLUR_FS = /* glsl */`
precision highp float;
uniform sampler2D tAO;
uniform highp sampler2D tDepth;
uniform vec2 uTexel;
uniform float uNear, uFar;
varying vec2 vUv;
float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
void main() {
  float zc = lin(texture2D(tDepth, vUv).x), s = 0.0, w = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 uv = vUv + vec2(float(x), float(y)) * uTexel * 1.5;
    float k = exp(-abs(lin(texture2D(tDepth, uv).x) - zc) / zc * 40.0);
    s += texture2D(tAO, uv).r * k; w += k;
  }
  gl_FragColor = vec4(vec3(s / max(w, 1e-4)), 1.0);
}`;

// 13-tap downsample (a box of boxes); the first bloom step also keeps only what is bright
const DOWN_FS = /* glsl */`
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uThreshold; // < 0: a plain downsample
varying vec2 vUv;
vec3 s(float x, float y) { return texture2D(tSrc, vUv + vec2(x, y) * uTexel).rgb; }
void main() {
  vec3 c = s(0.0, 0.0) * 0.125
    + (s(-2.0, 2.0) + s(2.0, 2.0) + s(-2.0, -2.0) + s(2.0, -2.0)) * 0.03125
    + (s(0.0, 2.0) + s(-2.0, 0.0) + s(2.0, 0.0) + s(0.0, -2.0)) * 0.0625
    + (s(-1.0, 1.0) + s(1.0, 1.0) + s(-1.0, -1.0) + s(1.0, -1.0)) * 0.125;
  if (uThreshold >= 0.0) {
    c = min(c, vec3(16.0));
    float l = max(c.r, max(c.g, c.b)), k = uThreshold * 0.5;
    float soft = clamp(l - uThreshold + k, 0.0, 2.0 * k); soft = soft * soft / (4.0 * k + 1e-4);
    c *= max(soft, l - uThreshold) / max(l, 1e-4);
  }
  gl_FragColor = vec4(c, 1.0);
}`;

// 9-tap tent upsample, added to the level above
const UP_FS = /* glsl */`
precision highp float;
uniform sampler2D tSrc, tBase;
uniform vec2 uTexel;
varying vec2 vUv;
vec3 s(float x, float y) { return texture2D(tSrc, vUv + vec2(x, y) * uTexel).rgb; }
void main() {
  vec3 c = s(0.0, 0.0) * 4.0 + (s(-1.0, 0.0) + s(1.0, 0.0) + s(0.0, -1.0) + s(0.0, 1.0)) * 2.0 + s(-1.0, -1.0) + s(1.0, -1.0) + s(-1.0, 1.0) + s(1.0, 1.0);
  gl_FragColor = vec4(c / 16.0 + texture2D(tBase, vUv).rgb, 1.0);
}`;

const FINAL_FS = /* glsl */`
precision highp float;
uniform sampler2D tScene, tAO, tBloom, tBlur1, tBlur2;
uniform highp sampler2D tDepth;
uniform float uAO, uBloom, uDof, uFocus, uNear, uFar, uExposure, uGrade;
uniform vec2 uPx;
varying vec2 vUv;
${IGN}
// FXAA (after Lottes' "lite" version), on the HDR scene with a tone-mapped luma: edges smoothed without the cost of MSAA
float luma(vec3 c) { float l = dot(c, vec3(0.299, 0.587, 0.114)); return l / (1.0 + l); }
vec3 fxaa(vec2 uv) {
  vec3 m = texture2D(tScene, uv).rgb;
  vec3 nw = texture2D(tScene, uv + vec2(-1.0, -1.0) * uPx).rgb, ne = texture2D(tScene, uv + vec2(1.0, -1.0) * uPx).rgb;
  vec3 sw = texture2D(tScene, uv + vec2(-1.0, 1.0) * uPx).rgb, se = texture2D(tScene, uv + vec2(1.0, 1.0) * uPx).rgb;
  float lm = luma(m), lnw = luma(nw), lne = luma(ne), lsw = luma(sw), lse = luma(se);
  float lo = min(lm, min(min(lnw, lne), min(lsw, lse))), hi = max(lm, max(max(lnw, lne), max(lsw, lse)));
  if (hi - lo < max(0.04, hi * 0.12)) return m;
  vec2 dir = vec2(-((lnw + lne) - (lsw + lse)), (lnw + lsw) - (lne + lse));
  float red = max((lnw + lne + lsw + lse) * 0.03125, 1.0 / 128.0), rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
  dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * uPx;
  vec3 a = 0.5 * (texture2D(tScene, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tScene, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tScene, uv - dir * 0.5).rgb + texture2D(tScene, uv + dir * 0.5).rgb);
  float lb = luma(b);
  return (lb < lo || lb > hi) ? a : b;
}
float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 c) {
  const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  return clamp(O * RRTAndODTFit(I * (c * uExposure / 0.6)), 0.0, 1.0);
}
vec3 srgb(vec3 c) { return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
void main() {
  vec3 c = fxaa(vUv);
  c *= mix(1.0, texture2D(tAO, vUv).r, uAO);
  if (uDof > 0.0) { // tilt-shift: what lies well before or behind the point looked at goes soft
    float dz = texture2D(tDepth, vUv).x, z = lin(dz), coc = dz >= 0.99999 ? 0.0 : clamp((abs(z - uFocus) / uFocus - 0.2) * 1.7, 0.0, 1.0) * uDof; // the sky stays sharp: no halo round the map
    c = mix(c, texture2D(tBlur1, vUv).rgb, smoothstep(0.0, 0.5, coc));
    c = mix(c, texture2D(tBlur2, vUv).rgb, smoothstep(0.45, 1.0, coc));
  }
  c += texture2D(tBloom, vUv).rgb * uBloom;
  c = aces(c);
  // the grade: shadows a touch teal, highlights a touch warm, colours a little richer
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722)), hi = smoothstep(0.08, 0.75, l);
  vec3 g = c * mix(vec3(0.95, 1.0, 1.045), vec3(1.04, 1.0, 0.95), hi);
  g = mix(vec3(dot(g, vec3(0.2126, 0.7152, 0.0722))), g, 1.08);
  c = mix(c, max(g, 0.0), uGrade);
  c = srgb(c) + (ign(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}`;

export function createPost(renderer) {
  const tri = new THREE.BufferGeometry();
  tri.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const quad = new THREE.Mesh(tri); quad.frustumCulled = false;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mat = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
  const target = (opts = {}) => {
    const t = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, ...opts });
    t.texture.minFilter = t.texture.magFilter = THREE.LinearFilter; t.texture.generateMipmaps = false;
    return t;
  };
  // no MSAA here: on integrated GPUs it costs more than all the passes below; FXAA in the last pass does the edges
  const sceneRT = target({ depthBuffer: true, samples: 0 });
  sceneRT.texture.minFilter = sceneRT.texture.magFilter = THREE.LinearFilter;
  sceneRT.depthTexture = new THREE.DepthTexture(1, 1); sceneRT.depthTexture.type = THREE.UnsignedIntType;
  const aoRT = target({ type: THREE.UnsignedByteType }), aoRT2 = target({ type: THREE.UnsignedByteType });
  const blur1 = target(), blur2 = target();
  const bloom = [target(), target(), target(), target()], up = [target(), target(), target()];

  const M = {
    ao: mat(AO_FS, { tDepth: { value: sceneRT.depthTexture }, uProjInv: { value: new THREE.Matrix4() }, uRes: { value: new THREE.Vector2() }, uRadius: { value: 1 }, uPx: { value: 1 }, uStrength: { value: 1.6 } }),
    aoBlur: mat(AO_BLUR_FS, { tAO: { value: aoRT.texture }, tDepth: { value: sceneRT.depthTexture }, uTexel: { value: new THREE.Vector2() }, uNear: { value: 0.3 }, uFar: { value: 2000 } }),
    down: mat(DOWN_FS, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: -1 } }),
    up: mat(UP_FS, { tSrc: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() } }),
    final: mat(FINAL_FS, {
      tScene: { value: sceneRT.texture }, tDepth: { value: sceneRT.depthTexture }, tAO: { value: aoRT2.texture }, tBloom: { value: up[2].texture },
      tBlur1: { value: blur1.texture }, tBlur2: { value: blur2.texture },
      uPx: { value: new THREE.Vector2() }, uAO: { value: 1 }, uBloom: { value: 0.1 }, uDof: { value: 0 }, uFocus: { value: 100 }, uNear: { value: 0.3 }, uFar: { value: 2000 }, uExposure: { value: 1 }, uGrade: { value: 1 },
    }),
  };
  const run = (m, rt) => { quad.material = m; renderer.setRenderTarget(rt); renderer.render(quad, cam); };
  const size = new THREE.Vector2();
  let W = 0, H = 0;
  function resize() {
    renderer.getDrawingBufferSize(size);
    const w = Math.max(1, size.x | 0), h = Math.max(1, size.y | 0);
    if (w === W && h === H) return;
    W = w; H = h;
    sceneRT.setSize(w, h);
    const h2 = [Math.max(1, w >> 1), Math.max(1, h >> 1)];
    aoRT.setSize(...h2); aoRT2.setSize(...h2); blur1.setSize(...h2);
    blur2.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
    bloom.forEach((t, k) => t.setSize(Math.max(1, w >> (k + 1)), Math.max(1, h >> (k + 1))));
    up.forEach((t, k) => t.setSize(Math.max(1, w >> (3 - k)), Math.max(1, h >> (3 - k))));
  }
  const down = (src, dst, threshold = -1) => { const u = M.down.uniforms; u.tSrc.value = src.texture; u.uTexel.value.set(1 / src.width, 1 / src.height); u.uThreshold.value = threshold; run(M.down, dst); };

  /** Draws the scene through the finishing passes. `o`: { dist (camera to target), ao, bloom, dof } */
  function render(scene, camera, o) {
    resize();
    renderer.setRenderTarget(sceneRT); renderer.render(scene, camera);
    const near = camera.near, far = camera.far;
    // ambient occlusion: a reach that grows with the view (houses up close, valleys from afar)
    if (o.ao > 0) {
      const u = M.ao.uniforms;
      u.uProjInv.value.copy(camera.projectionMatrixInverse); u.uRes.value.set(aoRT.width, aoRT.height);
      u.uRadius.value = THREE.MathUtils.clamp(o.dist * 0.012, 0.22, 3.2);
      u.uPx.value = aoRT.height * 0.5 * camera.projectionMatrix.elements[5];
      run(M.ao, aoRT);
      M.aoBlur.uniforms.uTexel.value.set(1 / aoRT.width, 1 / aoRT.height);
      M.aoBlur.uniforms.uNear.value = near; M.aoBlur.uniforms.uFar.value = far;
      run(M.aoBlur, aoRT2);
    }
    // bloom: the bright part, halved four times and gathered back
    if (o.bloom > 0) {
      down(sceneRT, bloom[0], 1.8);
      for (let k = 1; k < 4; k++) down(bloom[k - 1], bloom[k]);
      let src = bloom[3];
      for (let k = 0; k < 3; k++) { const u = M.up.uniforms; u.tSrc.value = src.texture; u.tBase.value = bloom[2 - k].texture; u.uTexel.value.set(1 / src.width, 1 / src.height); run(M.up, up[k]); src = up[k]; }
    }
    if (o.dof > 0) { down(sceneRT, blur1); down(blur1, blur2); }
    const u = M.final.uniforms;
    u.uAO.value = o.ao; u.uBloom.value = o.bloom; u.uDof.value = o.dof; u.uFocus.value = Math.max(1, o.dist);
    u.uNear.value = near; u.uFar.value = far; u.uExposure.value = renderer.toneMappingExposure; u.uPx.value.set(1 / W, 1 / H);
    run(M.final, null);
  }
  function dispose() {
    for (const t of [sceneRT, aoRT, aoRT2, blur1, blur2, ...bloom, ...up]) t.dispose();
    for (const m of Object.values(M)) m.dispose();
    tri.dispose();
  }
  return { render, dispose };
}
