import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

const eslintConfig = [
	...coreWebVitals,
	...typescript,
	{
		// This rule's own messages contain the deprecated string, so skip config files.
		ignores: ['eslint.config.mjs'],
		rules: {
			// Tailwind v4 renamed gradient utilities (bg-gradient-to-* -> bg-linear-to-*,
			// plus new bg-radial-* / bg-conic-*). The old names still render but are
			// deprecated. Flag them so they don't creep back in via copied v3 snippets.
			'no-restricted-syntax': [
				'warn',
				{
					selector: 'Literal[value=/bg-gradient-to-/]',
					message:
						'Tailwind v4: use `bg-linear-to-*` instead of the deprecated `bg-gradient-to-*`.',
				},
				{
					selector: 'TemplateElement[value.raw=/bg-gradient-to-/]',
					message:
						'Tailwind v4: use `bg-linear-to-*` instead of the deprecated `bg-gradient-to-*`.',
				},
			],
		},
	},
];

export default eslintConfig;
