/* Window.js

	Purpose:

	Description:

	History:
		Mon Nov 17 17:52:31     2008, Created by tomyeh

Copyright (C) 2008 Potix Corporation. All Rights Reserved.

This program is distributed under LGPL Version 3.0 in the hope that
it will be useful, but WITHOUT ANY WARRANTY.
*/
/** The window related widgets, such as window and panel.
 */
//zk.$package('zul.wnd');

(function () {
	var _modals = [], _lastfocus;

	function _syncMaximized(wgt) {
		if (!wgt._lastSize) return;
		var node = wgt.$n(),
			floated = wgt._mode != 'embedded',
			$op = floated ? jq(node).offsetParent() : jq(node).parent(),
			s = node.style;

		// Sometimes, the clientWidth/Height in IE6 is wrong.
		var sw = zk.ie6_ && $op[0].clientWidth == 0 ? $op[0].offsetWidth - $op.zk.borderWidth() : $op[0].clientWidth,
			sh = zk.ie6_ && $op[0].clientHeight == 0 ? $op[0].offsetHeight - $op.zk.borderHeight() : $op[0].clientHeight;
		if (!floated) {
			sw -= $op.zk.paddingWidth();
			sw = $op.zk.revisedWidth(sw);
			sh -= $op.zk.paddingHeight();
			sh = $op.zk.revisedHeight(sh);
		}

		s.width = jq.px0(sw);
		s.height = jq.px0(sh);
	}

	//drag move
	function _startmove(dg) {
		//Bug #1568393: we have to change the percetage to the pixel.
		var el = dg.node;
		if(el.style.top && el.style.top.indexOf("%") >= 0)
			 el.style.top = el.offsetTop + "px";
		if(el.style.left && el.style.left.indexOf("%") >= 0)
			 el.style.left = el.offsetLeft + "px";
		zWatch.fire('onFloatUp', dg.control); //notify all
	}
	function _ghostmove(dg, ofs, evt) {
		var wnd = dg.control,
			el = dg.node;
		_hideShadow(wnd);
		var $el = jq(el),
			$top = $el.find('>div:first'),
			top = $top[0],
			header = $top.nextAll('div:first')[0],
			fakeT = jq(top).clone()[0],
			fakeH = jq(header).clone()[0];
		jq(document.body).prepend(
			'<div id="zk_wndghost" class="' + wnd.getZclass() + '-move-ghost" style="position:absolute;top:'
			+ofs[1]+'px;left:'+ofs[0]+'px;width:'
			+$el.zk.offsetWidth()+'px;height:'+$el.zk.offsetHeight()
			+'px;z-index:'+el.style.zIndex+'"><dl></dl></div>');
		dg._wndoffs = ofs;
		el.style.visibility = "hidden";
		var h = el.offsetHeight - top.offsetHeight - header.offsetHeight;
		el = jq("#zk_wndghost")[0];
		el.firstChild.style.height = jq.px0(zk(el.firstChild).revisedHeight(h));
		el.insertBefore(fakeT, el.firstChild);
		el.insertBefore(fakeH, el.lastChild);
		return el;
	}
	function _endghostmove(dg, origin) {
		var el = dg.node; //ghost
		origin.style.top = jq.px(origin.offsetTop + el.offsetTop - dg._wndoffs[1]);
		origin.style.left = jq.px(origin.offsetLeft + el.offsetLeft - dg._wndoffs[0]);

		document.body.style.cursor = "";
	}
	function _ignoremove(dg, pointer, evt) {
		var el = dg.node,
			wgt = dg.control,
			tar = evt.domTarget, wtar;
		switch (tar) {
		case wgt.$n('close'):
		case wgt.$n('max'):
		case wgt.$n('min'):
			return true; //ignore special buttons
		}
		if(wgt != (wtar = zk.Widget.$(tar)) && wgt.caption != wtar)
			return true; //ignore child widget of caption, Bug B50-3166874
		if (!wgt.isSizable()
		|| (el.offsetTop + 4 < pointer[1] && el.offsetLeft + 4 < pointer[0]
		&& el.offsetLeft + el.offsetWidth - 4 > pointer[0]))
			return false; //accept if not sizable or not on border
		return true;
	}
	function _aftermove(dg, evt) {
		dg.node.style.visibility = "";
		var wgt = dg.control;
		wgt.zsync();
		wgt._fireOnMove(evt.data);
	}

	function _doOverlapped(wgt) {
		var pos = wgt._position,
			n = wgt.$n(),
			$n = zk(n);
		if (!pos && (!n.style.top || !n.style.left)) {
			var xy = $n.revisedOffset();
			n.style.left = jq.px(xy[0]);
			n.style.top = jq.px(xy[1]);
		} else if (pos == "parent")
			_posByParent(wgt);

		$n.makeVParent();
		wgt.zsync();
		_updDomPos(wgt);
		wgt.setTopmost();
		_makeFloat(wgt);
	}
	function _doModal(wgt) {
		var pos = wgt._position,
			n = wgt.$n(),
			$n = zk(n);
		if (pos == "parent") _posByParent(wgt);

		$n.makeVParent();
		wgt.zsync();
		_updDomPos(wgt, true, false, true);

		//Note: modal must be visible
		var realVisible = wgt.isRealVisible();
		wgt.setTopmost();
		
		if (!wgt._mask) {
			var anchor = wgt._shadowWgt ? wgt._shadowWgt.getBottomElement(): null;
			wgt._mask = new zk.eff.FullMask({
				id: wgt.uuid + "-mask",
				anchor: anchor ? anchor: wgt.$n(),
				//bug 1510218: we have to make it as a sibling
				zIndex: wgt._zIndex,
				visible: realVisible
			});
		}
		if (realVisible)
			_markModal(wgt);

		_makeFloat(wgt);
	}
	function _markModal(wgt) {
		zk.currentModal = wgt;
		var wnd = _modals[0], fc = zk.currentFocus;
		if (wnd) wnd._lastfocus = fc;
		else _lastfocus = fc;
		_modals.unshift(wgt);

		//We have to use setTimeout:
		//1) au's focus uses wgt.focus(0), i.e., 
		//   focus might have been changed to its decendant (Z30-focus.zul)
		//2) setVisible might use animation
		setTimeout(function () {
			zk.afterAnimate(function () {
				if (!zUtl.isAncestor(wgt, zk.currentFocus))
					wgt.focus();
			}, -1)});
	}
	function _unmarkModal(wgt) {
		_modals.$remove(wgt);
		if (zk.currentModal == wgt) {
			var wnd = zk.currentModal = _modals[0],
				fc = wnd ? wnd._lastfocus: _lastfocus;
			if (!wnd)
				_lastfocus = null;
			if (!fc || !fc.desktop)
				fc = wnd;
			if (fc)
				if (wgt._updDOFocus === false)
					wgt._updDOFocus = fc; //let _updDomOuter handle it
				else
					fc.focus(0); // use timeout for the bug 3057311
					// use 0 instead of 10, otherwise it will cause this bug 1936366
		}
		wgt._lastfocus = null;
	}
	/* Must be called before calling makeVParent. */
	function _posByParent(wgt) {
		var n = wgt.$n(),
			ofs = zk(zk(n).vparentNode(true)).revisedOffset();
		wgt._offset = ofs;
		n.style.left = jq.px(ofs[0] + zk.parseInt(wgt._left));
		n.style.top = jq.px(ofs[1] + zk.parseInt(wgt._top));
	}
	function _updDomOuter(wgt) {
		wgt._updDOFocus = false; //it might be set by unbind_
		wgt.rerender(wgt._skipper);
		var cf;
		if (cf = wgt._updDOFocus) //asked by unbind_
			cf.focus(10);
		delete wgt._updDOFocus;
	}
	//minTop - whether to at most 100px
	function _updDomPos(wgt, force, posParent, minTop) {
		if (!wgt.desktop || wgt._mode == 'embedded')
			return;

		var n = wgt.$n(), pos = wgt._position;
		if (pos == "parent") {
			if (posParent)
				_posByParent(wgt);
			return;
		}
		if (!pos && !force)
			return;

		var st = n.style;
		st.position = "absolute"; //just in case
		var ol = st.left, ot = st.top;
		if (pos != "nocenter")
			zk(n).center(pos);
		var sdw = wgt._shadowWgt;
		if (pos && sdw) {
			var opts = sdw.opts, l = n.offsetLeft, t = n.offsetTop;
			if (pos.indexOf("left") >= 0 && opts.left < 0)
				st.left = jq.px(l - opts.left);
			else if (pos.indexOf("right") >= 0 && opts.right > 0)
				st.left = jq.px(l - opts.right);
			if (pos.indexOf("top") >= 0 && opts.top < 0)
				st.top = jq.px(t - opts.top);
			else if (pos.indexOf("bottom") >= 0 && opts.bottom > 0)
				st.top = jq.px(t - opts.bottom);
		}

		if (minTop && !pos) { //adjust y (to upper location)
			var top = zk.parseInt(n.style.top), y = jq.innerY();
			if (y) {
				var y1 = top - y;
				if (y1 > 100) n.style.top = jq.px0(top - (y1 - 100));
			} else if (top > 100)
				n.style.top = "100px";
		}

		wgt.zsync();
		if (ol != st.left || ot != st.top)
			wgt._fireOnMove();
	}

	function _hideShadow(wgt) {
		var shadow = wgt._shadowWgt;
		if (shadow) shadow.hide();
	}
	function _makeSizer(wgt) {
		if (!wgt._sizer) {
			wgt.domListen_(wgt.$n(), 'onMouseMove');
			wgt.domListen_(wgt.$n(), 'onMouseOut');
			var Window = wgt.$class;
			wgt._sizer = new zk.Draggable(wgt, null, {
				stackup: true, 
				draw: Window._drawsizing,
				snap: Window._snapsizing,
				initSensitivity: 0,
				starteffect: Window._startsizing,
				ghosting: Window._ghostsizing,
				endghosting: Window._endghostsizing,
				ignoredrag: Window._ignoresizing,
				endeffect: Window._aftersizing});
		}
	}
	function _makeFloat(wgt) {
		var handle = wgt.$n('cap');
		if (handle && !wgt._drag) {
			jq(handle).addClass(wgt.getZclass() + '-header-move');
			var Window = wgt.$class;
			wgt._drag = new zk.Draggable(wgt, null, {
				handle: handle, stackup: true,
				fireOnMove: false,
				starteffect: _startmove,
				ghosting: _ghostmove,
				endghosting: _endghostmove,
				ignoredrag: _ignoremove,
				endeffect: _aftermove,
				zIndex: 99999 //Bug 2929590
			});
		}
	}

	function _isModal(mode) {
		return mode == 'modal' || mode == 'highlighted';
	}

var Window =
/**
 * A window.
 *
 * <p>Unlike other elements, each {@link Window} is an independent ID space.
 * It means a window and all its descendants forms a ID space and
 * the ID of each of them is unique in this space.
 * You could retrieve any of them in this space by calling {@link #$f}.
 *
 * <p>If a window X is a descendant of another window Y, X's descendants
 * are not visible in Y's space. To retrieve a descendant, say Z, of X, 
 * you have to invoke Y.$f('X').$f('Z').
 *
 * <p>Events:<br/>
 * onMove, onOpen, onMaximize, onMinimize, and onClose.<br/>
 * Note: to have better performance, onOpen is sent only if a
 * non-deferrable event listener is registered.
 * 
 * <p><code>onClose</code> is sent when the close button is pressed
 * (if {@link #isClosable} is true). The window has to detach or hide
 * the window.
 *
 * <p>On the other hand, <code>onOpen</code> is sent when a popup
 * window (i.e., {@link #getMode} is popup) is closed due to user's activity
 * (such as press ESC). This event is only a notification.
 * In other words, the popup is hidden before the event is sent to the server.
 * The application cannot prevent the window from being hidden.
 * 
 * <p>Default {@link #getZclass}: z-window-{@link #getMode()}.
 */
zul.wnd.Window = zk.$extends(zul.Widget, {
	_mode: 'embedded',
	_border: 'none',
	_minheight: 100,
	_minwidth: 200,
	_shadow: true,

	$init: function () {
		if (!zk.zkuery) this._fellows = {};

		this.$supers('$init', arguments);

		this.listen({onMaximize: this, onClose: this, onMove: this, onSize: this.onSizeEvent, onZIndex: this}, -1000);
		this._skipper = new zul.wnd.Skipper(this);
	},

	$define: { //zk.def
		/** Sets the mode to overlapped, popup, modal, embedded or highlighted.
		 *
		 * @param String name the mode which could be one of
		 * "embedded", "overlapped", "popup", "modal", "highlighted".
		 * Note: it cannot be "modal". Use {@link #doModal} instead.
		 */
		/** Returns the current mode.
		 * One of "modal", "embedded", "overlapped", "popup", and "highlighted".
		 * @return String
		 */
		mode: _zkf = function () {
			_updDomOuter(this);
		},
		/** 
		 * Sets the title.
		 * @param String title
		 */
		/** 
		 * Returns the title.
		 * Besides this attribute, you could use {@link zul.wgt.Caption} to define
		 * a more sophisticated caption (aka., title).
		 * <p>If a window has a caption whose label ({@link zul.wgt.Caption#getLabel})
		 * is not empty, then this attribute is ignored.
		 * <p>Default: empty.
		 * @return String
		 */
		title: function () {
			if (this.caption)
				this.caption.updateDomContent_(); // B50-ZK-313
			else
				_updDomOuter(this);
		},
		/** 
		 * Sets the border (either none or normal).
		 * @param String border the border. If null or "0", "none" is assumed.
		 */
		/** 
		 * Returns the border.
		 * The border actually controls what the content style class is
		 * is used. In fact, the name of the border (except "normal")
		 * is generate as part of the style class used for the content block.
		 * Refer to {@link #getContentSclass} for more details.
		 *
		 * <p>Default: "none".
		 * @return String
		 */
		border: _zkf,
		/**
		 * Sets whether to show a close button on the title bar.
		 * If closable, a button is displayed and the onClose event is sent
		 * if an user clicks the button.
		 *
		 * <p>Default: false.
		 *
		 * <p>Note: the close button won't be displayed if no title or caption at all.
		 * @param boolean closable
		 */
		/**
		 * Returns whether to show a close button on the title bar.
		 * @return boolean
		 */
		closable: _zkf,
		/** Sets whether the window is sizable.
		 * If true, an user can drag the border to change the window width.
		 * <p>Default: false.
		 * @param boolean sizable
		 */
		/** Returns whether the window is sizable.
		 * @return boolean
		 */
		sizable: function (sizable) {
			if (this.desktop) {
				if (sizable)
					_makeSizer(this);
				else if (this._sizer) {
					this._sizer.destroy();
					this._sizer = null;
				}
			}
		},
		/**
	     * Sets whether to display the maximizing button and allow the user to maximize
	     * the window, when a window is maximized, the button will automatically
	     * change to a restore button with the appropriate behavior already built-in
	     * that will restore the window to its previous size.
	     * <p>Default: false.
	     * 
		 * <p>Note: the maximize button won't be displayed if no title or caption at all.
		 * @param boolean maximizable
		 */
		/**
		 * Returns whether to display the maximizing button and allow the user to maximize
	     * the window. 
	     * <p>Default: false.
	     * @return boolean
		 */
		maximizable: _zkf,
		/**
	     * Sets whether to display the minimizing button and allow the user to minimize
	     * the window. Note that this button provides no implementation -- the behavior
	     * of minimizing a window is implementation-specific, so the MinimizeEvent
	     * event must be handled and a custom minimize behavior implemented for this
	     * option to be useful.
	     * 
	     * <p>Default: false. 
		 * <p>Note: the maximize button won't be displayed if no title or caption at all.
		 * @param boolean minimizable
		 */
		/**
		 * Returns whether to display the minimizing button and allow the user to minimize
	     * the window. 
	     * <p>Default: false.
	     * @return boolean
		 */
		minimizable: _zkf,
		/**
    	 * Sets whether the window is maximized, and then the size of the window will depend 
    	 * on it to show a appropriate size. In other words, if true, the size of the
    	 * window will count on the size of its offset parent node whose position is
    	 * absolute (by not {@link #doEmbedded()}) or its parent node. Otherwise, its size
    	 * will be original size. Note that the maximized effect will run at client's
    	 * sizing phase not initial phase.
		 * 
		 * <p>Default: false.
		 * @param boolean maximized
		 */
		/**
		 * Returns whether the window is maximized.
		 * @return boolean
		 */
		maximized: function (maximized, fromServer) {
			var node = this.$n();
			if (node) {
				var $n = zk(node),
					isRealVisible = this.isRealVisible();
				if (!isRealVisible && maximized) return;

				var l, t, w, h, s = node.style, cls = this.getZclass();
				if (maximized) {
					jq(this.$n('max')).addClass(cls + '-maxd');

					var floated = this._mode != 'embedded',
						$op = floated ? jq(node).offsetParent() : jq(node).parent();
					l = s.left;
					t = s.top;
					w = s.width;
					h = s.height;

					// prevent the scroll bar.
					s.top = "-10000px";
					s.left = "-10000px";

					// Sometimes, the clientWidth/Height in IE6 is wrong.
					var sw = zk.ie6_ && $op[0].clientWidth == 0 ? $op[0].offsetWidth - $op.zk.borderWidth() : $op[0].clientWidth,
						sh = zk.ie6_ && $op[0].clientHeight == 0 ? $op[0].offsetHeight - $op.zk.borderHeight() : $op[0].clientHeight;
					if (!floated) {
						sw -= $op.zk.paddingWidth();
						sw = $n.revisedWidth(sw);
						sh -= $op.zk.paddingHeight();
						sh = $n.revisedHeight(sh);
					}
					s.width = jq.px0(sw);
					s.height = jq.px0(sh);
					this._lastSize = {l:l, t:t, w:w, h:h};

					// restore.
					s.top = "0";
					s.left = "0";
					
					// resync
					w = s.width;
					h = s.height;
				} else {
					var max = this.$n('max'),
						$max = jq(max);
					$max.removeClass(cls + "-maxd").removeClass(cls + "-maxd-over");
					if (this._lastSize) {
						s.left = this._lastSize.l;
						s.top = this._lastSize.t;
						s.width = this._lastSize.w;
						s.height = this._lastSize.h;
						this._lastSize = null;
					}
					l = s.left;
					t = s.top;
					w = s.width;
					h = s.height;

					var body = this.$n('cave');
					if (body)
						body.style.width = body.style.height = "";
				}
				if (!fromServer || isRealVisible) {
					this._visible = true;
					this.fire('onMaximize', {
						left: l,
						top: t,
						width: w,
						height: h,
						maximized: maximized,
						fromServer: fromServer
					});
				}
				if (isRealVisible) {
					this.__maximized = true;
					zUtl.fireSized(this);
				}
			}
		},
		/**
		 * Sets whether the window is minimized.
		 * <p>Default: false.
		 * @param boolean minimized
		 */
		/**
		 * Returns whether the window is minimized.
		 * <p>Default: false.
		 * @return boolean
		 */
		minimized: function (minimized, fromServer) {
			if (this._maximized)
				this.setMaximized(false);

			var node = this.$n();
			if (node) {
				var s = node.style, l = s.left, t = s.top, w = s.width, h = s.height;
				if (minimized) {
					zWatch.fireDown('onHide', this);
					jq(node).hide();
				} else {
					jq(node).show();
					zUtl.fireShown(this);
				}
				if (!fromServer) {
					this._visible = false;
					this.zsync();
					this.fire('onMinimize', {
						left: s.left,
						top: s.top,
						width: s.width,
						height: s.height,
						minimized: minimized
					});
				}
			}
		},
		/** 
		 * Sets the CSS style for the content block of the window.
		 * <p>Default: null.
		 * @param String contentStyle
		 */
		/** 
		 * Returns the CSS style for the content block of the window.
		 * @return String
		 */
		contentStyle: _zkf,
		/**
		 * Sets the style class used for the content block.
		 * @param String contentSclass
		 */
		/** 
		 * Returns the style class used for the content block.
		 * @return String
		 */
		contentSclass: _zkf,
		/** Sets how to position the window at the client screen.
		 * It is meaningless if the embedded mode is used.
		 *
		 * @param String pos how to position. It can be null (the default), or
		 * a combination of the following values (by separating with comma).
		 * <dl>
		 * <dt>center</dt>
		 * <dd>Position the window at the center. {@link #setTop} and {@link #setLeft}
		 * are both ignored.</dd>
		 * <dt>left</dt>
		 * <dd>Position the window at the left edge. {@link #setLeft} is ignored.</dd>
		 * <dt>right</dt>
		 * <dd>Position the window at the right edge. {@link #setLeft} is ignored.</dd>
		 * <dt>top</dt>
		 * <dd>Position the window at the top edge. {@link #setTop} is ignored.</dd>
		 * <dt>bottom</dt>
		 * <dd>Position the window at the bottom edge. {@link #setTop} is ignored.</dd>
		 * <dt>parent</dt>
		 * <dd>Position the window relative to its parent.
		 * That is, the left and top ({@link #getTop} and {@link #getLeft})
		 * is an offset to his parent's let-top corner.</dd>
		 * </dl>
		 * <p>For example, "left,center" means to position it at the center of
		 * the left edge.
		 */
		/** Returns how to position the window at the client screen.
		 * It is meaningless if the embedded mode is used.
		 *
		 * <p>Default: null which depends on {@link #getMode}:
		 * If overlapped or popup, {@link #setLeft} and {@link #setTop} are
		 * assumed. If modal or highlighted, it is centered.
		 * @return String
		 */
		position: function (/*pos*/) {
			_updDomPos(this, false, this._visible);
		},
		/**
		 * Sets the minimum height in pixels allowed for this window.
		 * If negative, 100 is assumed.
		 * <p>Default: 100. 
		 * <p>Note: Only applies when {@link #isSizable()} = true.
		 * @param int minheight
		 */
		/**
		 * Returns the minimum height.
		 * <p>Default: 100.
		 * @return int
		 */
		minheight: null, //TODO
		/**
		 * Sets the minimum width in pixels allowed for this window. If negative,
		 * 200 is assumed.
		 * <p>Default: 200. 
		 * <p>Note: Only applies when {@link #isSizable()} = true.
		 * @param int minwidth
		 */
		/**
		 * Returns the minimum width.
		 * <p>Default: 200.
		 * @return int
		 */
		minwidth: null, //TODO
		/** Sets whether to show the shadow of an overlapped/popup/modal
		 * window. It is meaningless if it is an embedded window.
		 * <p>Default: true.
		 * @param boolean shadow
		 */
		/** Returns whether to show the shadow of an overlapped/popup/modal
		 * window. It is meaningless if it is an embedded window.
		 * @return boolean
		 */
		shadow: function () {
			if (this._shadow) {
				this.zsync();
			} else if (this._shadowWgt) {
				this._shadowWgt.destroy();
				this._shadowWgt = null;
			}
		}
	},
	/** Re-position the window based on the value of {@link #getPosition}.
	 * @since 5.0.3
	 */
	repos: function () {
		_updDomPos(this, false, this._visible);
	},
	/** Makes this window as overlapped with other components.
	 */
	doOverlapped: function () {
		this.setMode('overlapped');
	},
	/** Makes this window as popup, which is overlapped with other component
	 * and auto-hiden when user clicks outside of the window.
	 */
	doPopup: function () {
		this.setMode('popup');
	},
	/** Makes this window as highlited. The visual effect is
	 * the similar to the modal window.
	 */
	doHighlighted: function () {
		this.setMode('highlighted');
	},
	/** Makes this window as a modal dialog.
	 * It will automatically center the window (ignoring {@link #getLeft} and
	 * {@link #getTop}).
	 */
	doModal: function () {
		this.setMode('modal');
	},
	/** Makes this window as embeded with other components (Default).
	 */
	doEmbedded: function () {
		this.setMode('embedded');
	},

	//@Override
	afterAnima_: function (visible) { //mode="highlighted" action="hide:slideDown"
		this.$supers('afterAnima_', arguments);
		this.zsync();
	},

	zsync: function () {
		this.$supers('zsync', arguments);
		if (this.desktop) {
			if (this._mode == 'embedded') {
				if (this._shadowWgt) {
					this._shadowWgt.destroy();
					this._shadowWgt = null;
				}
			} else if (this._shadow) {
				if (!this._shadowWgt)
					this._shadowWgt = new zk.eff.Shadow(this.$n(),
						{left: -4, right: 4, top: -2, bottom: 3});
				if (this._maximized || this._minimized || !this._visible) //since action might be applied, we have to check _visible
					_hideShadow(this);
				else
					this._shadowWgt.sync();
			}
			if (this._mask && this._shadowWgt) {
				var n = this._shadowWgt.getBottomElement()||this.$n(); //null if ff3.5 (no shadow/stackup)
				if (n) this._mask.sync(n);
			}
		}
	},

	//event handler//
	onClose: function () {
		if (!this.inServer) //let server handle if in server
			this.parent.removeChild(this); //default: remove
	},
	onMove: function (evt) {
		this._left = evt.left;
		this._top = evt.top;
	},
	onMaximize: function (evt) {
		var data = evt.data;
		this._top = data.top;
		this._left = data.left;
		this._height = data.height;
		this._width = data.width;
	},
	onSizeEvent: function (evt) {
		var data = evt.data,
			node = this.$n(),
			s = node.style;
			
		_hideShadow(this);
		if (data.width != s.width) {
			s.width = data.width;
			this._fixWdh();
		}	
		if (data.height != s.height) {
			s.height = data.height;
			this._fixHgh();
		}
				
		if (data.left != s.left || data.top != s.top) {
			s.left = data.left;
			s.top = data.top;
			this._fireOnMove(evt.keys);
		}
		
		this.zsync();
		var self = this;
		setTimeout(function() {
			zUtl.fireSized(self);
		}, zk.ie6_ ? 800: 0);
	},
	onZIndex: _zkf = function (evt) {
		this.zsync();
	},
	//watch//
	onResponse: _zkf,
	onShow: function (ctl) {
		var w = ctl.origin;
		if (this != w && this._mode != 'embedded'
		&& this.isRealVisible({until: w, dom: true})) {
			zk(this.$n()).cleanVisibility();
			this.zsync();
		}
	},
	onHide: function (ctl) {
		var w = ctl.origin;
		if (this != w && this._mode != 'embedded'
		&& this.isRealVisible({until: w, dom: true})) {
		//Note: dom:true, since isVisible might be wrong when onHide is called.
		//For example, tab sets selected and then fire onHide, and tabpanel's
		//isVisible returns false (since unselected). Thus, it is better to
		//count on DOM only
			this.$n().style.visibility = 'hidden';
			this.zsync();
		}
	},
	beforeSize: function() {
		// Bug 2974370: IE 6 will get the wrong parent's width when self's width greater then parent's
		if (this._maximized && !this.__maximized) 
			this.$n().style.width="";
	},
	onSize: function() {
		_hideShadow(this);
		if (this._maximized) {
			if (!this.__maximized)
				_syncMaximized(this);
			this.__maximized = false; // avoid deadloop
		}
		this._fixHgh();
		this._fixWdh();
		if (this._mode != 'embedded')
			_updDomPos(this);
		this.zsync();
	},
	onFloatUp: function (ctl) {
		if (!this._visible || this._mode == 'embedded')
			return; //just in case

		var wgt = ctl.origin;
		if (this._mode == 'popup') {
			for (var floatFound; wgt; wgt = wgt.parent) {
				if (wgt == this) {
					if (!floatFound) this.setTopmost();
					return;
				}
				floatFound = floatFound || wgt.isFloating_();
			}
			this.setVisible(false);
			this.fire('onOpen', {open:false});
		} else
			for (; wgt; wgt = wgt.parent) {
				if (wgt == this) {
					this.setTopmost();
					return;
				}
				if (wgt.isFloating_())
					return;
			}
	},
	_fixWdh: zk.ie7_ ? function () {
		if (this._mode != 'embedded' && this._mode != 'popup' && this.isRealVisible()) {
			var n = this.$n(),
				cave = this.$n('cave').parentNode,
				wdh = n.style.width,
				$n = jq(n),
				$tl = $n.find('>div:first'),
				tl = $tl[0],
				hl = tl && this.$n("cap") ? $tl.nextAll('div:first')[0]: null,
				bl = $n.find('>div:last')[0];

			if (!wdh || wdh == "auto") {
				var $cavp = zk(cave.parentNode),
					diff = $cavp.padBorderWidth() + zk(cave.parentNode.parentNode).padBorderWidth();
				if (tl) tl.firstChild.style.width = jq.px0(cave.offsetWidth + diff);
				if (hl) hl.firstChild.firstChild.style.width = jq.px(cave.offsetWidth
					- (zk(hl).padBorderWidth() + zk(hl.firstChild).padBorderWidth() - diff));
				if (bl) bl.firstChild.style.width = jq.px0(cave.offsetWidth + diff);
			} else {
				if (tl) tl.firstChild.style.width = "";
				if (hl) hl.firstChild.style.width = "";
				if (bl) bl.firstChild.style.width = "";
				
				// for B50-3317729.zul
				if (this._hflex == 'min')
					zk(n).redoCSS();
			}
		}
	} : zk.$void,
	_fixHgh: function () {
		if (this.isRealVisible()) {
			var n = this.$n(),
				hgh = n.style.height,
				cave = this.$n('cave'),
				cvh = cave.style.height;

			if (zk.ie6_ && hgh && hgh != "auto" && hgh != '100%'/*bug #1944729*/)
				cave.style.height = "0";

			if (hgh && hgh != "auto") {
				zk(cave).setOffsetHeight(this._offsetHeight(n));
			} else if (cvh && cvh != "auto") {
				if (zk.ie6_) cave.style.height = "0";
				cave.style.height = "";
			}
		}
	},
	_offsetHeight: function (n) {
		var h = n.offsetHeight - this._titleHeight(n);
		if(zul.wnd.WindowRenderer.shallCheckBorder(this)) {
			var cave = this.$n('cave'),
				bl = jq(n).find('>div:last')[0],
				cap = this.$n("cap");
			h -= bl.offsetHeight;
			if (cave)
				h -= zk(cave.parentNode).padBorderHeight();
			if (cap)
				h -= zk(cap.parentNode).padBorderHeight();
		}
		return h - zk(n).padBorderHeight();
	},
	_titleHeight: function (n) {
		var cap = this.$n('cap'),
			$tl = jq(n).find('>div:first'), tl = $tl[0];
		return cap ? cap.offsetHeight + tl.offsetHeight:
			zul.wnd.WindowRenderer.shallCheckBorder(this) ? tl.offsetHeight: 0;
	},

	_fireOnMove: function (keys) {
		var pos = this._position, node = this.$n(),
			x = zk.parseInt(node.style.left),
			y = zk.parseInt(node.style.top);
		if (pos == 'parent') {
			var vp = zk(node).vparentNode();
			if (vp) {
				var ofs = zk(vp).revisedOffset();
				x -= ofs[0];
				y -= ofs[1];
			}
		}
		this.fire('onMove', zk.copy({
			left: x + 'px',
			top: y + 'px'
		}, keys), {ignorable: true});

	},
	//super//
	setVisible: function (visible) {
		if (this._visible != visible) {
			if (this._maximized) {
				this.setMaximized(false);
			} else if (this._minimized) {
				this.setMinimized(false);
			}

			var modal = _isModal(this._mode);
			if (visible) {
				_updDomPos(this, modal, true, modal);
				if (modal && (!this.parent || this.parent.isRealVisible())) {
					this.setTopmost();
					_markModal(this);
				}
			} else if (modal)
				_unmarkModal(this);

			this.$supers('setVisible', arguments);

			if (!visible)
				this.zsync();
		}
	},
	setHeight: function (height) {
		this.$supers('setHeight', arguments);
		if (this.desktop)
			zUtl.fireSized(this);
				// Note: IE6 is broken, because its offsetHeight doesn't update.
	},
	setWidth: function (width) {
		this.$supers('setWidth', arguments);
		if (this.desktop)
			zUtl.fireSized(this);
	},
	setTop: function () {
		_hideShadow(this);
		this.$supers('setTop', arguments);
		this.zsync();

	},
	setLeft: function () {
		_hideShadow(this);
		this.$supers('setLeft', arguments);
		this.zsync();
	},
	setZIndex: _zkf = function (zIndex) {
		var old = this._zIndex;
		this.$supers('setZIndex', arguments);
		if (old != zIndex) 
			this.zsync();
	},
	setZindex: _zkf,
	focus_: function (timeout) {
		var cap = this.caption;
		for (var w = this.firstChild; w; w = w.nextSibling)
			if (w != cap && w.focus_(timeout))
				return true;
		return cap && cap.focus_(timeout);
	},
	getZclass: function () {
		var zcls = this._zclass;
		return zcls != null ? zcls: "z-window-" + this._mode;
	},

	onChildAdded_: function (child) {
		this.$supers('onChildAdded_', arguments);
		if (child.$instanceof(zul.wgt.Caption)) {
			this.caption = child;
			this.rerender(this._skipper); // B50-ZK-275
		}
	},
	onChildRemoved_: function (child) {
		this.$supers('onChildRemoved_', arguments);
		if (child == this.caption) {
			this.caption = null;
			this.rerender(this._skipper); // B50-ZK-275
		}
	},
	insertChildHTML_: function (child, before, desktop) {
		if (!child.$instanceof(zul.wgt.Caption)) // B50-ZK-275
			this.$supers('insertChildHTML_', arguments);
	},
	domStyle_: function (no) {
		var style = this.$supers('domStyle_', arguments);
		if ((!no || !no.visible) && this._minimized)
			style = 'display:none;'+style;
		if (this._mode != 'embedded')
			style = "position:absolute;"+style;
		return style;
	},

	bind_: function (desktop, skipper, after) {
		this.$supers(Window, 'bind_', arguments);

		var mode = this._mode;
		zWatch.listen({onSize: this, onShow: this});

		// Bug 2974370
		if (zk.ie6_)
			zWatch.listen({beforeSize: this});

		if (mode != 'embedded') {
			zWatch.listen({onFloatUp: this, onHide: this});
			this.setFloating_(true);

			if (_isModal(mode)) _doModal(this);
			else _doOverlapped(this);
		}
		
		if (this._sizable)
			_makeSizer(this);

		if (this._maximizable && this._maximized) {
			var self = this;
			after.push(function() {
				self._maximized = false;
				self.setMaximized(true, true);
			});
		}

		if (this._mode != 'embedded' && (!zk.css3)) {
			jq.onzsync(this); //sync shadow if it is implemented with div
			zWatch.listen({onResponse: this});
		}
	},
	unbind_: function () {
		var node = this.$n();
		zk(node).beforeHideOnUnbind();
		node.style.visibility = 'hidden'; //avoid unpleasant effect

		if (!zk.css3) jq.unzsync(this);

		//we don't check this._mode here since it might be already changed
		if (this._shadowWgt) {
			this._shadowWgt.destroy();
			this._shadowWgt = null;
		}
		if (this._drag) {
			this._drag.destroy();
			this._drag = null;
		}
		if (this._sizer) {
			this._sizer.destroy();
			this._sizer = null;
		}

		if (this._mask) {
			this._mask.destroy();
			this._mask = null;
		}

		zk(node).undoVParent();
		zWatch.unlisten({
			onFloatUp: this,
			onSize: this,
			onShow: this,
			onHide: this,
			onResponse: this
		});
		if (zk.ie6_)
			zWatch.unlisten({beforeSize: this});
		this.setFloating_(false);

		_unmarkModal(this);

		this.domUnlisten_(this.$n(), 'onMouseMove');
		this.domUnlisten_(this.$n(), 'onMouseOut');
		this.$supers(Window, 'unbind_', arguments);
	},
	_doMouseMove: function (evt) {
		if (this._sizer && evt.target == this) {
			var n = this.$n(),
				c = this.$class._insizer(n, zk(n).revisedOffset(), evt.pageX, evt.pageY),
				handle = this._mode == 'embedded' ? false : this.$n('cap'),
				zcls = this.getZclass();
			if (!this._maximized && c) {
				if (this._backupCursor == undefined)
					this._backupCursor = n.style.cursor;
				n.style.cursor = c == 1 ? 'n-resize': c == 2 ? 'ne-resize':
					c == 3 ? 'e-resize': c == 4 ? 'se-resize':
					c == 5 ? 's-resize': c == 6 ? 'sw-resize':
					c == 7 ? 'w-resize': 'nw-resize';
				if (handle) jq(handle).removeClass(zcls + '-header-move');
			} else {
				n.style.cursor = this._backupCursor || ''; // bug #2977948
				if (handle) jq(handle).addClass(zcls + '-header-move');
			}
		}
	},
	_doMouseOut: function (evt) {
		this.$n().style.cursor = this._backupCursor || '';
	},
	doClick_: function (evt) {
		switch (evt.domTarget) {
		case this.$n('close'):
			this.fire('onClose');
			break;
		case this.$n('max'):
			this.setMaximized(!this._maximized);
			break;
		case this.$n('min'):
			this.setMinimized(!this._minimized);
			break;
		default:
			this.$supers('doClick_', arguments);
			return;
		}
		evt.stop();
	},
	doMouseOver_: function (evt) {
		switch (evt.domTarget) {
		case this.$n('close'):
			jq(this.$n('close')).addClass(this.getZclass() + '-close-over');
			break;
		case this.$n('max'):
			var zcls = this.getZclass(),
				added = this._maximized ? ' ' + zcls + '-maxd-over' : '';
			jq(this.$n('max')).addClass(zcls + '-max-over' + added);
			break;
		case this.$n('min'):
			jq(this.$n('min')).addClass(this.getZclass() + '-min-over');
			break;
		}
		this.$supers('doMouseOver_', arguments);
	},
	doMouseOut_: function (evt) {
		switch (evt.domTarget) {
		case this.$n('close'):
			jq(this.$n('close')).removeClass(this.getZclass() + '-close-over');
			break;
		case this.$n('max'):
			var zcls = this.getZclass(),
				$max = jq(this.$n('max'));
			if (this._maximized)
				$max.removeClass(zcls + '-maxd-over');
			$max.removeClass(zcls + '-max-over');
			break;
		case this.$n('min'):
			jq(this.$n('min')).removeClass(this.getZclass() + '-min-over');
			break;
		}
		this.$supers('doMouseOut_', arguments);
	},
	//@Override, children minimum flex might change window dimension, have to re-position. bug #3007908.
	afterChildrenMinFlex_: function (orient) {
		this.$supers('afterChildrenMinFlex_', arguments);
		if (_isModal(this._mode)) //win hflex="min"
			_updDomPos(this, true); //force re-position since window width might changed.
	},
	//@Override, children minimize flex might change window dimension, have to re-position. bug #3007908.
	afterChildrenFlex_: function (cwgt) {
		this.$supers('afterChildrenFlex_', arguments);
		if (_isModal(this._mode))
			_updDomPos(this, true); //force re-position since window width might changed.
	},
	setFlexSizeH_: function(n, zkn, height, isFlexMin) {
		if (isFlexMin) {
			height += this._titleHeight(n) +
				(zul.wnd.WindowRenderer.shallCheckBorder(this) ? jq(n).find('>div:last')[0].offsetHeight : 0);
		}
		this.$supers('setFlexSizeH_', arguments);
	},
	//@Override, do not count size of floating window in flex calculation. bug #3172785.
	ignoreFlexSize_: function (type) {
		return this._mode != 'embedded';
	}
},{ //static
	// drag sizing (also referenced by Panel.js)
	_startsizing: function (dg) {
		zWatch.fire('onFloatUp', dg.control); //notify all
	},
	_snapsizing: function (dg, pos) {
		// snap y only when dragging upper boundary/corners 
		px = (dg.z_dir >= 6 && dg.z_dir <= 8) ? 
				Math.max(pos[0], 0) : pos[0];
		// snap x only when dragging left boundary/corners
		py = (dg.z_dir == 8 || dg.z_dir <= 2) ? 
				Math.max(pos[1], 0) : pos[1];
		return [px, py];
	},
	_ghostsizing: function (dg, ofs, evt) {
		var wnd = dg.control,
			el = dg.node;
		_hideShadow(wnd);
		wnd.setTopmost();
		var $el = jq(el);
		jq(document.body).append(
			'<div id="zk_ddghost" class="' + wnd.getZclass() + '-resize-faker"'
			+' style="position:absolute;top:'
			+ofs[1]+'px;left:'+ofs[0]+'px;width:'
			+$el.zk.offsetWidth()+'px;height:'+$el.zk.offsetHeight()
			+'px;z-index:'+el.style.zIndex+'"><dl></dl></div>');
		return jq('#zk_ddghost')[0];
	},
	_endghostsizing: function (dg, origin) {
		var el = dg.node; //ghostvar org = zkau.getGhostOrgin(dg);
		if (origin) {
			dg.z_szofs = {
				top: el.offsetTop + 'px', left: el.offsetLeft + 'px',
				height: jq.px0(zk(el).revisedHeight(el.offsetHeight)),
				width: jq.px0(zk(el).revisedWidth(el.offsetWidth))
			};
		}
	},
	_insizer: function(node, ofs, x, y) {
		var r = ofs[0] + node.offsetWidth, b = ofs[1] + node.offsetHeight;
		if (x - ofs[0] <= 5) {
			if (y - ofs[1] <= 5)
				return 8;
			else if (b - y <= 5)
				return 6;
			else
				return 7;
		} else if (r - x <= 5) {
			if (y - ofs[1] <= 5)
				return 2;
			else if (b - y <= 5)
				return 4;
			else
				return 3;
		} else {
			if (y - ofs[1] <= 5)
				return 1;
			else if (b - y <= 5)
				return 5;
		}
	},
	_ignoresizing: function (dg, pointer, evt) {
		var el = dg.node,
			wgt = dg.control;
		if (wgt._maximized) return true;

		var offs = zk(el).revisedOffset(),
			v = wgt.$class._insizer(el, offs, pointer[0], pointer[1]);
		if (v) {
			_hideShadow(wgt);
			dg.z_dir = v;
			dg.z_box = {
				top: offs[1], left: offs[0] ,height: el.offsetHeight,
				width: el.offsetWidth, minHeight: zk.parseInt(wgt.getMinheight()),
				minWidth: zk.parseInt(wgt.getMinwidth())
			};
			dg.z_orgzi = el.style.zIndex;
			return false;
		}
		return true;
	},
	_aftersizing: function (dg, evt) {
		var wgt = dg.control,
			data = dg.z_szofs;
		wgt.fire('onSize', zk.copy(data, evt.keys), {ignorable: true});
		dg.z_szofs = null;
	},
	_drawsizing: function(dg, pointer, evt) {
		if (dg.z_dir == 8 || dg.z_dir <= 2) {
			var h = dg.z_box.height + dg.z_box.top - pointer[1];
			if (h < dg.z_box.minHeight) {
				pointer[1] = dg.z_box.height + dg.z_box.top - dg.z_box.minHeight;
				h = dg.z_box.minHeight;
			}
			dg.node.style.height = jq.px0(h);
			dg.node.style.top = jq.px(pointer[1]);
		}
		if (dg.z_dir >= 4 && dg.z_dir <= 6) {
			var h = dg.z_box.height + pointer[1] - dg.z_box.top;
			if (h < dg.z_box.minHeight)
				h = dg.z_box.minHeight;
			dg.node.style.height = jq.px0(h);
		}
		if (dg.z_dir >= 6 && dg.z_dir <= 8) {
			var w = dg.z_box.width + dg.z_box.left - pointer[0];
			if (w < dg.z_box.minWidth) {
				pointer[0] = dg.z_box.width + dg.z_box.left - dg.z_box.minWidth;
				w = dg.z_box.minWidth;
			}
			dg.node.style.width = jq.px0(w);
			dg.node.style.left = jq.px(pointer[0]);
		}
		if (dg.z_dir >= 2 && dg.z_dir <= 4) {
			var w = dg.z_box.width + pointer[0] - dg.z_box.left;
			if (w < dg.z_box.minWidth)
				w = dg.z_box.minWidth;
			dg.node.style.width = jq.px0(w);
		}
	}
});

zul.wnd.Skipper = zk.$extends(zk.Skipper, {
	$init: function (wnd) {
		this._w = wnd;
	},
	restore: function () {
		this.$supers('restore', arguments);
		var w = this._w;
		if (w._mode != 'embedded') {
			_updDomPos(w); //skipper's size is wrong in bind_
			w.zsync();
		}
	}
});

/** @class zul.wnd.WindowRenderer
 * The renderer used to render a window.
 * It is designed to be overriden
 * @since 5.0.5
 */
zul.wnd.WindowRenderer = {
	/** Returns whether to check the border's height.
	 * 
	 * @param zul.wnd.Window wgt the window
	 */
	shallCheckBorder: function (wgt) {
		return wgt._mode != 'embedded' && wgt._mode != 'popup';
	}
};
})();