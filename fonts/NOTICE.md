# Bundled fonts

These typefaces power the Monad type system (see `@font-face` in `index.html`).
Both are redistributed under the **SIL Open Font License 1.1** (OFL), which permits
bundling in an application as long as this attribution travels with them.

| Role      | Upstream typeface        | Author / Copyright                          | License |
| --------- | ------------------------ | ------------------------------------------- | ------- |
| Body / UI | Inter (variable)         | Copyright The Inter Project Authors         | OFL 1.1 |
| Display   | Space Grotesk (variable) | Copyright The Space Grotesk Project Authors | OFL 1.1 |

Files are the `latin` subset, variable-weight `woff2` builds. Full license text:
https://openfontlicense.org

Inter: https://github.com/rsms/inter ·
Space Grotesk: https://github.com/floriankarsten/space-grotesk

Monospace is not bundled — the page uses the reader's system mono stack
(`ui-monospace`, SF Mono, Menlo, Consolas), which costs no bytes and matches the
terminal font they already read code in.
