# zi

Setup:

```sh
yarn install
# bootstrap the internal tooling used to build
# non-bootstrap packages
yarn workspace esbp build -v
```

## Building extensions

```
yarn workspace zi-webextension-chrome build --watch
yarn workspace zi-webextension-chrome bundle --watch
```
