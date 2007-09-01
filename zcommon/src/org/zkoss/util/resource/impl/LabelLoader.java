/* LabelLoader.java

{{IS_NOTE
	Purpose:
		
	Description:
		
	History:
		Mon Jun 12 13:05:05     2006, Created by tomyeh
}}IS_NOTE

Copyright (C) 2006 Potix Corporation. All Rights Reserved.

{{IS_RIGHT
}}IS_RIGHT
*/
package org.zkoss.util.resource.impl;

import java.util.Iterator;
import java.util.List;
import java.util.LinkedList;
import java.util.Map;
import java.util.HashMap;
import java.util.Locale;
import java.util.Enumeration;
import java.net.URL;
import java.io.InputStream;
import java.io.IOException;

import org.zkoss.mesg.MCommon;
import org.zkoss.lang.SystemException;
import org.zkoss.util.Maps;
import org.zkoss.util.Locales;
import org.zkoss.util.resource.LabelLocator;
import org.zkoss.util.resource.ClassLocator;
import org.zkoss.util.logging.Log;
import org.zkoss.util.WaitLock;
import org.zkoss.xel.Expressions;
import org.zkoss.xel.XelContext;
import org.zkoss.xel.VariableResolver;
import org.zkoss.xel.util.SimpleXelContext;

/**
 * The label loader (implementation only).
 *
 * Used to implement {@link org.zkoss.util.resource.Labels}.
 *
 * @author tomyeh
 */
public class LabelLoader {
	private static final Log log = Log.lookup(LabelLoader.class);

	/** A map of (Locale l, Map(String key, String label)). */
	private final Map _labels = new HashMap(6);
	/** A list of LabelLocator. */
	private final List _locators = new LinkedList();
	/** The XEL context. */
	private XelContext _xelc;

	/** Returns the label of the specified key, or null if not found.
	 */
	public String getLabel(String key) {
		final String label =
			getProperty(Locales.getCurrent(), key);
		if (label == null || label.length() == 0 || label.indexOf("${") < 0)
			return label;

		//Interpret it
		try {
	    	return (String)
	    		Expressions.evaluate(_xelc, label, String.class);
	    } catch (Throwable ex) {
	    	log.error("Illegal label: key="+key+" value="+label, ex);
	    	return label; //recover it
	    }
	}

	/** Sets the variable resolver, which is used if an EL expression
	 * is specified.
	 *
	 * @since 3.0.0
	 */
	public VariableResolver setVariableResolver(VariableResolver resolv) {
		final VariableResolver old =
			_xelc != null ? _xelc.getVariableResolver(): null;
		_xelc = resolv != null ? new SimpleXelContext(resolv, null): null;
		return old;
	}
	/** Registers a locator which is used to load i3-label*.properties
	 * from other resource, such as servlet contexts.
	 */
	public void register(LabelLocator locator) {
		if (locator == null)
			throw new NullPointerException("locator");

		synchronized (_locators) {
			//no need to use hashset because # of locators are few
			for (Iterator it = _locators.iterator(); it.hasNext();)
				if (it.next().equals(locator)) {
					log.warning("Ignored because of replication: "+locator);
					return; //replicated
				}
			_locators.add(locator);
		}

		reset(); //Labels might be loaded before, so...
	}
	/** Resets all cached labels and next call to {@link #getLabel}
	 * will cause re-loading i3-label*.proerties.
	 */
	public void reset() {
		synchronized (_labels) {
			_labels.clear();
		}
	}

	//-- deriver to override --//
	/** Returns the property without interprets any expression.
	 * It searches properties defined in i3-label*.properties
	 * All label accesses are eventually done by this method.
	 *
	 * <p>To alter its behavior, you might override this method.
	 */
	protected String getProperty(Locale locale, String key) {
		String label = (String)getLabels(locale).get(key);
		if (label != null)
			return label;

		final String lang = locale.getLanguage();
		final String cnty = locale.getCountry();
		final String var = locale.getVariant();
		if (var != null && var.length() > 0) {
			label = (String)getLabels(new Locale(lang, cnty)).get(key);
			if (label != null)
				return label;
		}
		if (cnty != null && cnty.length() > 0) {
			label = (String)getLabels(new Locale(lang, "")).get(key);
			if (label != null)
				return label;
		}
		return "en".equals(lang) ? null: (String)getLabels(Locale.ENGLISH).get(key);
	}

	//-- private utilities --//
	/** Returns Map(String key, String label) of the specified locale. */
	private final Map getLabels(Locale locale) {
		WaitLock lock = null;
		for (;;) {
			final Object o;
			synchronized (_labels) {	
				o = _labels.get(locale);
				if (o == null)
					_labels.put(locale, lock = new WaitLock()); //lock it
			}

			if (o instanceof Map)
				return (Map)o;
			if (o == null)
				break; //go to load the page

			//wait because some one is creating the servlet
			if (!((WaitLock)o).waitUntilUnlock(5*60*1000))
				log.warning("Take too long to wait loading labels: "+locale
					+"\nTry to load again automatically...");
		} //for(;;)

		try {
			//get the class name
			log.info("Loading labels for "+locale);
			final Map labels = new HashMap(617);

			//1. load from modules
			final ClassLocator locator = new ClassLocator();
			//if (log.finerable()) log.finer("Resources found: "+xmls);
			for (Enumeration en = locator.getResources(getI3LabelPath(locale));
			en.hasMoreElements();) {
				final URL url = (URL)en.nextElement();
				load(labels, url);
			}

			//2. load from extra resource
			for (Iterator it = _locators.iterator(); it.hasNext();) {
				final URL url = ((LabelLocator)it.next()).locate(locale);
				if (url != null)
					load(labels, url);
			}

			//add to map
			synchronized (_labels) {
				_labels.put(locale, labels);
			}

			return labels;
		} catch (Throwable ex) {
			synchronized (_labels) {
				_labels.remove(locale);
			}
			throw SystemException.Aide.wrap(ex);
		} finally {
			lock.unlock(); //unlock (always unlock to avoid deadlock)
		}
	}
	/** Returns the path of metainfo/i3-label.properties. */
	private static final String getI3LabelPath(Locale locale) {
		return locale.equals(Locale.ENGLISH) ?
			"metainfo/i3-label.properties":
			"metainfo/i3-label_" + locale + ".properties";
	}
	/** Loads all labels from the specified URL. */
	private static final void load(Map labels, URL url) throws IOException {
		log.info(MCommon.FILE_OPENING, url);
		final Map news = new HashMap();
		Maps.load(news, url.openStream());
		for (Iterator it = news.entrySet().iterator(); it.hasNext();) {
			final Map.Entry me = (Map.Entry)it.next();
			final Object key = me.getKey();
			if (labels.put(key, me.getValue()) != null)
				log.warning("Label of "+key+" is replaced by "+url);
		}
	}
}
