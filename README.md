# Surfonxy

> An experimental home made, ~~[Bun](https://bun.sh) optimized~~ Node (since there's some issues with Bun, see below), web proxy.

## Issues with Bun

The following issues are preventing us from 100% supporting Bun as of right now.

- <https://github.com/oven-sh/bun/issues/5556>
- <https://github.com/oven-sh/bun/issues/4529>

## Motivation

To finally provide a *well working*, easy to use, ad-free and completely transparent web proxy to humanity.

Since it's in heavy development, the "well working" part is a bit wrong, but it'll improve over time !

## Methods used to proxy

We use different methods to proxy every requests that are done in the client.

### Monkey patching

Required for [WebSocket](https://developer.mozilla.org/docs/Web/API/WebSocket) and much more prototypes such as MessageEvent.

We also use this to proxy/intercept some methods like `document.URI`, `document.referrer`, `window.open`, ...

### Service Worker

This one is used to intercept every possible requests and rewrite the URL before sending it.
That way, we're sure that everything is requested to our proxy.

There's a placeholder page that can be triggered when adding the `__sf_register=1` search parameter to any URL. This page installs the service-worker and redirects the user to the desired page when done.

### Server-side tweaking

We rewrite HTML documents when they're requested server-side. That way we can pre-patch some elements, for example `<a>` elements, before sending them to the client.

We also tweak JS scripts, to rewrite every `location` to `__sfLocation`. That allows to proxy the `window.location` property.

<!-- TODO: Add `postMessage`s and `import`s  -->

<!-- TODO: Add workers -->

## Development

Since we use Node, we use `pnpm` as the main package manager. You can install it using `npm i -g pnpm`.

Even though, some scripts will use Bun (such as the `bun:tests` one). You can still run them using `pnpm`, it's fine.

### Commands

| Command | Description |
| ------- | ----------- |
| `pnpm lint` | Lints the codebase using `eslint`. |
| `pnpm node:start` | Starts the proxy with HTTPS on port `443` **with Node** (using [`tsx`](https://www.npmjs.com/package/tsx)) |
| `pnpm bun:start` | Starts the proxy with HTTPS on port `443` **with Bun** directly (kinda broken for now) |
| `pnpm bun:tests` | Run the simple sandbox *test* server from [`./tests`](./tests/) on the port `8000`. |

### Build the `https` certificate for local `surfonxy.dev`

> Extracted from <https://web.dev/how-to-use-local-https/#running-your-site-locally-with-https-using-mkcert-recommended>
>
> Note that these steps needs to be done on the Windows side if you're running under WSL2.

First, install [`mkcert`](https://github.com/FiloSottile/mkcert/releases).

Run `mkcert -install` and restart your browser(s) if needed.

Then, we're going to add `surfonxy.dev` in our `/etc/hosts` file (or `C:\Windows\System32\drivers\etc\hosts` on Windows)

Here's a one-liner for Linux users :

```bash
echo "127.0.0.1 surfonxy.dev" | sudo tee -a /etc/hosts

# or this if you're already root, no sudo needed.
echo "127.0.0.1 surfonxy.dev" | tee -a /etc/hosts
```

Otherwise on Windows, you can open the file with Notepad (`notepad C:\Windows\System32\drivers\etc\hosts` in Administrator) and add the following line :

```hosts
127.0.0.1 surfonxy.dev
```

Finally, we're going to create a certificate for this host, using `mkcert surfonxy.dev`.

You'll see two new files in your current directory, `surfonxy.dev.pem` and `surfonxy.dev-key.pem`.

Move them in this `example` directory. On WSL2, you just drag the created certificates into the `example` folder.

You're now ready ! You can run `pnpm node:start` and go to <https://surfonxy.dev> to see the test server running.
