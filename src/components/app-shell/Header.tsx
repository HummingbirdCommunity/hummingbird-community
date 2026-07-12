import type { ReactElement } from 'react';

import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { UserSwitcher } from '@/components/UserSwitcher';

// Top bar of the app shell. The admin "view as user" switcher sits on the left
// (renders nothing for non-admins) and the language switcher is pinned right.
export function Header(): ReactElement {
	return (
		<header className="bg-card/80 sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-3 backdrop-blur">
			<div className="flex items-center gap-2">
				<UserSwitcher />
			</div>
			<div className="ml-auto flex items-center gap-2">
				<LanguageSwitcher />
			</div>
		</header>
	);
}
