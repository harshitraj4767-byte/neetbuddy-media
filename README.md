# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Deploy on Hostinger Business shared hosting

This repository is configured as a static SPA so it works without a VPS.

### Hostinger Git deployment settings

- **Branch:** `main`
- **Node.js version:** `22.x`
- **Install command:** `npm ci`
- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Environment variables:** none are required by this starter

The build creates `dist/index.html`, copies all public assets, and creates
`dist/.htaccess` so direct visits and refreshed nested routes load correctly.

### If hPanel still shows 403

1. In File Manager, open the domain's document root (normally `public_html`).
2. Remove an old default `index.php` if it is taking precedence.
3. Confirm that `index.html`, `.htaccess`, `assets/`, `favicon.ico`, and
   `robots.txt` are directly inside `public_html` — not inside a nested
   `dist` folder.
4. Set folders to permission `755` and files to `644`.
5. In hPanel, make sure the domain's document root points to `public_html`.

For manual deployment, run `npm ci && npm run build`, then upload the
**contents** of `dist/` to `public_html`.

The `npm` deprecation messages are warnings from dependencies; they do not
cause the Hostinger 403 and do not make a successful build fail.
