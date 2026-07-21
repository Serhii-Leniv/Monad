# Bundled fonts

The page's display face is the app's own brand serif (see `@font-face` in
`index.html`), redistributed under the **SIL Open Font License 1.1** (OFL),
which permits bundling as long as this attribution travels with it.

| Role    | Upstream typeface       | Author / Copyright                                        | License |
| ------- | ----------------------- | --------------------------------------------------------- | ------- |
| Display | Lora (variable, roman)  | Copyright 2011 The Lora Project Authors (Cyreal)          | OFL 1.1 |
| Display | Lora (variable, italic) | Copyright 2011 The Lora Project Authors (Cyreal)          | OFL 1.1 |

These are the same `latin`-subset variable `woff2` builds the Monad app itself
ships as "Monad Serif", so the site and the app render one identity.
Full license text: https://openfontlicense.org · Lora: https://github.com/cyrealtype/Lora

Body text is not bundled — the page uses the reader's system UI stack, which
costs no bytes. Monospace likewise uses the system mono stack (`ui-monospace`,
SF Mono, Cascadia Code, Menlo, Consolas), matching the terminal font a
developer already reads code in.
