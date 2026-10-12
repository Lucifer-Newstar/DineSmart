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
  const controlsWithoutLabel = [];
  const FORM_CONTROL_TAGS = new Set(["input", "select", "textarea"]);

  function location(node) {
    const position = source.getLineAndCharacterOfPosition(node.getStart(source));
    return `${path.relative(appRoot, filePath)}:${position.line + 1}`;
  }

  function tagNameOf(element) {
    const tag = element.tagName;
    return ts.isIdentifier(tag) || ts.isPropertyAccessExpression(tag)
      ? ts.isIdentifier(tag)
        ? tag.text
        : tag.name.text
      : "";
  }

  function hasAttribute(element, name) {
    return element.attributes.properties.some(
      (property) =>
        ts.isJsxAttribute(property) &&
        ts.isIdentifier(property.name) &&
        property.name.text === name,
    );
  }

  function containsVisibleText(node) {
    if (ts.isJsxText(node) && node.text.trim().length > 0) return true;
    return node
      .getChildren(source)
      .some((child) => child !== node && !ts.isJsxExpression(child) && containsVisibleText(child));
  }

  function isLabelledByWrapper(control) {
    let current = control.parent;
    while (current) {
      if (ts.isJsxElement(current) && tagNameOf(current.openingElement) === "label") {
        return current.children.some((child) => containsVisibleText(child));
      }
      current = current.parent;
    }
    return false;
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

    if (ts.isJsxOpeningElement(node) && FORM_CONTROL_TAGS.has(tagNameOf(node))) {
      if (!hasAttribute(node, "aria-label") && !hasAttribute(node, "aria-labelledby")) {
        const control = node.parent;
        if (!ts.isJsxElement(control) && !ts.isJsxSelfClosingElement(control)) {
          controlsWithoutLabel.push(location(node));
        } else if (!isLabelledByWrapper(control)) {
          controlsWithoutLabel.push(location(node));
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
  return { emptyClickHandlers, buttonsWithoutType, controlsWithoutLabel };
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

test("app form controls expose an accessible name", () => {
  const unlabelled = inspectedFiles.flatMap(({ controlsWithoutLabel }) => controlsWithoutLabel);
  assert.deepEqual(unlabelled, []);
});
