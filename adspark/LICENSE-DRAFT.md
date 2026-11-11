# License (draft)

> This is a draft for discussion, not legal advice. Have it reviewed by a lawyer before commercial use.

Copyright © 2026 Shahin Salimov. All rights reserved.

## Proposed terms

1. **Ownership.** The AdSpark source code, design and documentation belong to the copyright holder.
2. **Evaluation use.** You may install and run AdSpark locally to evaluate it.
3. **Commercial use** requires a separate written license from the copyright holder.
4. **No redistribution** of the source code or a modified version without written permission.
5. **Your content.** Campaigns, briefs, logos and exports you create belong to you. AdSpark claims no rights to them.
6. **AI providers.** If you enable AI generation, your use of the provider is governed by your agreement with that provider, and provider charges are yours.
7. **No warranty.** The software is provided “as is”, without warranty of any kind. Review generated content before publishing; you are responsible for the advertising claims you publish.

## Third-party components

AdSpark ships with open-source packages under their own licenses, including:

| Package | License |
| --- | --- |
| React, React DOM, React Router, Zustand, jsPDF, Zod | MIT |
| Lucide icons | ISC |
| `@anthropic-ai/sdk`, `openai` (server only) | Apache-2.0 |
| Inter, Plus Jakarta Sans fonts | SIL Open Font License 1.1 |
| DejaVu fonts (PDF export) | Bitstream Vera / DejaVu license (see the package README and LICENSE) |

Development tools (Vite, Vitest, Playwright, ESLint, Tailwind CSS, TypeScript) are not part of the shipped app. Check each package's license file in `node_modules` before distribution.
