/**
 * Commit message rules for the whole repository.
 *
 * The conventional preset is extended with the `demo` type, which the project
 * history already uses for presentation and demo-capture work. Scopes are the
 * backlog task IDs (for example `S4-01`), so no scope-case rule is added.
 * CI lints only the commits a push or pull request introduces, because some of
 * the earliest messages predate these rules.
 */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "build",
        "chore",
        "ci",
        "demo",
        "docs",
        "feat",
        "fix",
        "perf",
        "refactor",
        "revert",
        "style",
        "test",
      ],
    ],
    "header-max-length": [2, "always", 120],
  },
};
