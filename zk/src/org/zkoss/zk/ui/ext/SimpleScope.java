/* SimpleScope.java

	Purpose:
		
	Description:
		
	History:
		Sat Sep 12 13:22:02     2009, Created by tomyeh

Copyright (C) 2009 Potix Corporation. All Rights Reserved.

This program is distributed under GPL Version 3.0 in the hope that
it will be useful, but WITHOUT ANY WARRANTY.
*/
package org.zkoss.zk.ui.ext;

import java.util.Iterator;
import java.util.AbstractSet;
import java.util.Set;
import java.util.List;
import java.util.LinkedList;
import java.util.Map;
import java.util.HashMap;

/**
 * A simple implementation of {@link Scope}.
 * It supports {@link ScopeListener}, but it doesn't support
 * the concept of parent scope.
 * Thus, the deriving class can override
 * {@link #getAttribute(String,Object,boolean)},
 * {@link #hasAttribute(string,Object)},
 * and invoke {@link #notifyParentChanged} if the parent is changed.
 *
 * @author tomyeh
 * @since 5.0.0
 */
public class SimpleScope implements Scope {
	private Map _attrs;
	private List _listeners;

	//Scope//
	public Map getAttributes() {
		if (_attrs == null) _attrs = new Attrs();
		return _attrs;
	}
	public Object getAttribute(String name) {
		return _attrs != null ? _attrs.get(name): null;
	}
	public boolean hasAttribute(String name) {
		return _attrs != null && _attrs.containsKey(name);
	}
	public Object setAttribute(String name, Object value) {
		if (_attrs == null) _attrs = new Attrs();
		return _attrs.put(name, value);
	}
	public Object removeAttribute(String name) {
		return _attrs != null ? _attrs.remove(name): null;
	}

	/** The same as getAttribute(name). */
	public Object getAttribute(String name, boolean local) {
		return getAttribute(name);
	}
	/** The same as hasAttribute(name). */
	public boolean hasAttribute(String name, boolean local) {
		return hasAttribute(name);
	}

	public boolean addScopeListener(ScopeListener listener) {
		if (listener == null)
			throw new IllegalArgumentException("null");

		if (_listeners == null)
			_listeners = new LinkedList();
		else if (_listeners.contains(listener))
			return false;

		_listeners.add(listener);
		return true;
	}
	public boolean removeScopeListener(ScopeListener listener) {
		return _listeners != null && _listeners.remove(listener);
	}

	/** Invokes {@link ScopeListener#onAdd} for registered
	 * listeners.
	 */
	private void notifyAdd(String name, Object value) {
		if (_listeners != null)
			for (Iterator it = _listeners.iterator(); it.hasNext();)
				((ScopeListener)it.next()).onAdd(name, value);
	}
	/** Invokes {@link ScopeListener#onRemove} for registered
	 * listeners.
	 */
	private void notifyRemove(String name) {
		if (_listeners != null)
			for (Iterator it = _listeners.iterator(); it.hasNext();)
				((ScopeListener)it.next()).onRemove(name);
	}
	/** Invokes {@link ScopeListener#onParentChanged} for registered
	 * listeners.
	 *
	 * @see #addChangeListener
	 */
	public void notifyParentChanged(Scope newparent) {
		if (_listeners != null)
			for (Iterator it = _listeners.iterator(); it.hasNext();)
				((ScopeListener)it.next()).onParentChanged(newparent);
	}

	//clone//
	/** Clones this scope. */
	public Object clone() {
		final SimpleScope clone = new SimpleScope();
		clone._attrs = _attrs != null ? new HashMap(_attrs): null;
		//TODO: handle _listeners
		return clone;
	}

	//Helper Class//
	private class Attrs extends HashMap {
		public Object remove(Object key) {
			if (_listeners != null && super.containsKey(key))
				notifyRemove((String)key);
			return super.remove(key);
		}
		public Object put(Object key, Object val) {
			notifyAdd((String)key, val);
			return super.put(key, val);
		}
		public Set entrySet() {
			return new AttrSet(super.entrySet(), true);
		}
		public Set keySet() {
			return new AttrSet(super.keySet(), false);
		}
		private class AttrSet extends AbstractSet {
			private final Set _set;
			private final boolean _entry;
			private AttrSet(Set set, boolean entry) {
				_set = set;
				_entry = entry;
			}
			public Iterator iterator() {
				return new AttrIter(_set.iterator());
			}
			public int size() {
				return _set.size();
			}
			public boolean add(Object o) {
				if (_entry) {
					final Map.Entry me = (Map.Entry)o;
					notifyAdd((String)me.getKey(), me.getValue());
				} else
					notifyAdd((String)o, null);
				return _set.add(o);
			}
			public boolean remove(Object o) {
				if (_set.remove(o)) {
					notifyRemove((String)(_entry ? ((Map.Entry)o).getKey(): o));
					return true;
				}
				return false;
			}
			public boolean contains(Object o) {
				return _set.contains(o);
			}
			private class AttrIter implements Iterator {
				private final Iterator _it;
				private Object _last;
				private AttrIter(Iterator it) {
					_it = it;
				}
				public boolean hasNext() {
					return _it.hasNext();
				}
				public Object next() {
					return _last = _it.next();
				}
				public void remove() {
					_it.remove();
					notifyRemove((String)(_entry ? ((Map.Entry)_last).getKey(): _last));
				}
			}
		}
	}
}
