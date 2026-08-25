# HTML Dashboard Template

## Project Structure & Module Organization

This repository is a Vite-powered static dashboard template. Source HTML pages live in `src/`, with reusable fragments in `src/partials/` such as `head.html`, `header.html`, and `sidebar.html`. Tailwind and daisyUI styles start from `src/css/tailwind.css`. Built static files are written to `public/`, including generated HTML pages and `public/output.css`; treat these as build output unless you are intentionally updating distributable assets.

## Build, Test, and Development Commands

- `npm run dev`: builds CSS, then starts the Vite dev server from `src/`.
- `npm run build`: builds all HTML pages into `public/` and regenerates minified CSS.
- `npm run build:css`: compiles `src/css/tailwind.css` to `public/output.css`.

Run `npm install` after changing dependencies. There is no dedicated test command in `package.json`; use `npm run build` as the primary verification step.

## Coding Style & Naming Conventions

Use the existing HTML-first structure and keep page filenames lowercase kebab-case, for example `products-new.html` or `settings-api.html`. Put shared layout changes in `src/partials/` instead of duplicating markup across pages. JavaScript config uses tabs, double quotes, and no semicolons, matching `vite.config.js`. The project includes Prettier and `prettier-plugin-tailwindcss`; format touched HTML/CSS before committing, for example with `npx prettier --write src/**/*.html src/css/tailwind.css`.

## HTML & CSS

HTML must be based on daisyUI syntax and conventions. Use daisyUI Blueprint MCP server (if available) or daisyUI Skill to look up component syntax and conventions every time you're writing HTML.

Do not use Tailwind CSS utility classes if a daisyUI component already provides the desired styling. If a daisyUI does not have a specific component, you can use Tailwind CSS utility classes. For customizing daisyUI components, if customization is required, use the daisyUI modifier class names (get from Blueprint MCP or daisyUI Skill). If the customization is not available as a modifier class, use Tailwind CSS utility classes.

You are allowed to use Tailwind CSS grid, flex, and spacing utility classes to position and align elements and blocks.

Do not write any custom CSS unless it's absolutely necessary and cannot be achieved with daisyUI or Tailwind CSS utility classes.

## Testing Guidelines

No automated test framework or coverage threshold is currently configured. For changes, run `npm run build` and inspect the affected generated page in `public/` or through the dev server. When editing shared partials, check representative pages from each area, such as `index.html`, `products.html`, `users.html`, and `settings-general.html`.

## Security & Configuration Tips

Do not commit secrets or environment-specific values into HTML templates. Keep dependency changes minimal and update both `package.json` and `package-lock.json` together.
