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

function inspectInteractiveMarkup(filePath) {
  const text = readFileSync(filePath, "utf8");
  const source = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const emptyClickHandlers = [];
  const buttonsWithoutType = [];

  function location(node) {
    const position = source.getLineAndCharacterOfPosition(node.getStart(source));
    return `${path.relative(appRoot, filePath)}:${position.line + 1}`;
  }

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
        emptyClickHandlers.push(location(node));
      }
    }

    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      ts.isIdentifier(node.tagName) &&
      node.tagName.text === "button" &&
      !node.attributes.properties.some(
        (property) =>
          ts.isJsxAttribute(property) &&
          ts.isIdentifier(property.name) &&
          property.name.text === "type",
      )
    ) {
      buttonsWithoutType.push(location(node));
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
  return { emptyClickHandlers, buttonsWithoutType };
}

const inspectedFiles = listComponentFiles(appRoot).map((filePath) => ({
  filePath,
  ...inspectInteractiveMarkup(filePath),
}));

test("JSX click handlers in the app do not use empty function bodies", () => {
  const emptyHandlers = inspectedFiles.flatMap(({ emptyClickHandlers }) => emptyClickHandlers);
  assert.deepEqual(emptyHandlers, []);
});

test("app button elements declare their intended button type", () => {
  const implicitButtons = inspectedFiles.flatMap(({ buttonsWithoutType }) => buttonsWithoutType);
  assert.deepEqual(implicitButtons, []);
});
