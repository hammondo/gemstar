# BodySpace Recovery Studio — Dashboard Client

React 19 + Vite 8 + Tailwind CSS v4 dashboard for the BodySpace social-media agent system.

## Brand Colour Palette

Defined in `src/index.css` via the Tailwind v4 `@theme` block. All values are aligned to [bodyspacerecoverystudio.com.au](https://bodyspacerecoverystudio.com.au).

| Token | Hex | Usage |
|---|---|---|
| `warm-50` | `#ffffff` | Input backgrounds |
| `warm-100` | `#F6EEEC` | Page background (body) |
| `warm-200` | `#eeddd8` | Borders, dividers |
| `teal-300` | `#b9eae7` | Light accents, hover tints |
| `teal-400` | `#6fcacb` | Primary buttons, active row highlights, progress bars |
| `teal-600` | `#3895a1` | — (available for deep contrast) |
| `teal-700` | `#00627b` | Headings, hashtag text, dark accent |
| `charcoal` | `#223131` | Hero header text |
| `muted` | `#555555` | Secondary / body text |
| `ok` | `#6fcacb` | Success badges (published, approved) |
| `warn` | `#b87333` | Warning badges (pending_review, scheduled) |
| `bad` | `#c25050` | Error badges (rejected) |

Fonts: **Poppins** (400 / 500 / 600 / 700) via Google Fonts, applied as `--font-heading` and `--font-body`.

---

## Vite + React

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
