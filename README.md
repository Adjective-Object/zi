# zi

Setup:

```sh
yarn install
# bootstrap the internal tooling used to build
# non-bootstrap packages
yarn workspace esbp build -v
```

## Setup

### Set up the workspace

```sh
yarn install
# optional: build devtools
yarn workspace fix-package-imports build
yarn workspace new-package build
```

### Build the zi CLI tool and extension

```sh
yarn workspace zi-compile-closure build
yarn workspace zi-webextension-chrome build:mjs --watch
yarn workspace zi-webextension-chrome bundle --watch
```

### Install in edge

-   Go to `edge://extensions/`
-   turn on developer mode
-   "Load Unpacked" and point to `packages/zi/zi-webextension-generic`

### Set up the demo app

```sh
yarn workspace demo-project build:mjs --watch
yarn workspace demo-project vite
```

### Use zi extension against the demo app

```sh
yarn workspace demo-project compile-closure # build the demo closure
```

Then with vite running against the demo project, click "Reload Closure".
