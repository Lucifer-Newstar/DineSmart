import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/app");

function listComponentFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listComponentFiles(entryPath);
    return /\.[jt]sx$/.test(entry.name) ? [entryPath] : [];
  });
}

function findEmptyClickHandlers(filePath) {
  const text = readFileSync(filePath, "utf8");
  const source = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const emptyHandlers = [];

  function visit(node) {
    if (
      ts.isJsxAttribute(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "onClick" &&
      node.initializer &&
      ts.isJsxExpression(node.initializer) &&
      node.initializer.expression
    ) {
      const handler = node.initializer.expression;
      if (
        (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler)) &&
        ts.isBlock(handler.body) &&
        handler.body.statements.length === 0
      ) {
        const position = source.getLineAndCharacterOfPosition(node.getStart(source));
        emptyHandlers.push(`${path.relative(appRoot, filePath)}:${position.line + 1}`);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
  return emptyHandlers;
}

test("JSX click handlers in the app do not use empty function bodies", () => {
  const emptyHandlers = listComponentFiles(appRoot).flatMap(findEmptyClickHandlers);
  assert.deepEqual(emptyHandlers, []);
});
