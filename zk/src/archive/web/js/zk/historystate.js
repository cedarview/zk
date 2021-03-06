/* historystate.js

	Purpose:

	Description:

	History:
		Wed Jul 26 12:25:26 CST 2017, Created by rudyhuang

Copyright (C) 2017 Potix Corporation. All Rights Reserved.

	This program is distributed under LGPL Version 2.1 in the hope that
	it will be useful, but WITHOUT ANY WARRANTY.
*/
zk.historystate = (function () {
	var popped = ('state' in window.history),
		initialURL = location.href;

	return {
		enabled: true,
		onPopState: function (event) {
			var initialPop = !popped && location.href == initialURL;
			popped = true;
			if (initialPop) return;

			var data = {
				state: event.state,
				url: location.href
			};
			zAu.send(new zk.Event(null, 'onHistoryPopState', data, { implicit: true }), 1);
			if (zk.bmk.checkBookmark)
				zk.bmk.checkBookmark();
		},
		register: function () {
			if (zk.historystate.enabled)
				window.addEventListener('popstate', this.onPopState);
		}
	};
})();
zk._apac(function () { zk.historystate.register(); }); //see mount.js (after page AU cmds)
