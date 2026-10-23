// §12.1 The globe (v0.67): a sphere of hexagons with twelve pentagons, named by longitude and latitude. The flat world
// keeps its numbers. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NEIGHBORS, TILE_COUNT, col, dist, findTile, row, stepDir, tileCountOf, useShape, within } from "../src/hex.ts";

test("a globe of 25 002 tiles: all hexagons but twelve pentagons, every link both ways", () => {
  useShape({ kind: "sphere", freq: 50 });
  try {
    assert.equal(TILE_COUNT, 25002); assert.equal(tileCountOf({ kind: "sphere", freq: 50 }), 25002);
    const degrees = NEIGHBORS.map(n => n.length);
    assert.equal(degrees.filter(d => d === 5).length, 12);
    assert.equal(degrees.filter(d => d === 6).length, 25002 - 12);
    assert.ok(NEIGHBORS.every((ns, i) => ns.every(j => NEIGHBORS[j].includes(i) && dist(i, j) === 1)));
    // rings as on the flat world
    const i = findTile(105.8, 21);
    assert.equal(within(i, 1).length, 7); assert.equal(within(i, 3).length, 37); assert.equal(within(i, 10).length, 331);
  } finally { useShape({ kind: "flat" }); }
});

test("tiles are named by longitude and latitude; the ways point true; there is no edge to the world", () => {
  useShape({ kind: "sphere", freq: 50 });
  try {
    const i = findTile(105.8, 21);
    assert.ok(Math.abs(col(i) - 105.8) < 1.5 && Math.abs(row(i) - 21) < 1.5, `${col(i)}, ${row(i)}`);
    assert.ok(row(stepDir(i, "N")) > row(i), "north is up");
    assert.ok(row(stepDir(i, "S")) < row(i), "south is down");
    assert.ok(col(stepDir(i, "E")) > col(i), "east is on");
    // the date line is no edge: across it is one step
    assert.equal(dist(findTile(179.9, 0), findTile(-179.9, 0)) <= 1, true);
    assert.ok(within(findTile(180, 0), 2).some(j => col(j) < 0) && within(findTile(180, 0), 2).some(j => col(j) > 0));
    // the poles are tiles too
    assert.ok(findTile(0, 90) >= 0 && findTile(0, -90) >= 0);
  } finally { useShape({ kind: "flat" }); }
});

test("the flat world is as it was", () => {
  useShape({ kind: "flat" });
  assert.equal(TILE_COUNT, 128 * 128);
  assert.equal(findTile(5, 7), 7 * 128 + 5);
  assert.equal(col(7 * 128 + 5), 5); assert.equal(row(7 * 128 + 5), 7);
  assert.equal(stepDir(7 * 128 + 5, "E"), 7 * 128 + 6);
  assert.equal(within(64 * 128 + 64, 3).length, 37);
});
