import type { ReactElement } from 'react';

import { LanguageSwitcher } from '@/components/LanguageSwitcher';

// Top-right language toggle for public pages that render outside the app shell
// (home, login) and so don't get the header's switcher.
export function FloatingLanguageSwitcher(): ReactElement {
	return (
		<div className="fixed top-4 right-4 z-50">
			<LanguageSwitcher />
		</div>
	);
}
