/* global window, document, CSSRule */
/** Run inside the browser fixture to emulate a WebView without container queries or cq units. */
export function emulateLegacyCSS() {
  const link = window.card.shadowRoot.querySelector('link[rel=stylesheet]');
  const transform = (rules) =>
    [...rules]
      .map((rule) => {
        if (rule.constructor.name === 'CSSContainerRule') return '';
        if (
          rule.type === CSSRule.SUPPORTS_RULE &&
          rule.conditionText.replace(/\s/g, '') === 'not(container-type:size)'
        )
          return transform(rule.cssRules);
        if (rule.cssRules && !rule.style)
          return (
            rule.cssText.slice(0, rule.cssText.indexOf('{') + 1) + transform(rule.cssRules) + '}'
          );
        if (rule.style)
          for (const key of [...rule.style])
            if (/cq(w|h|i|min|max)\b/.test(rule.style.getPropertyValue(key)))
              rule.style.removeProperty(key);
        return rule.cssText;
      })
      .join('\n');
  const style = document.createElement('style');
  style.textContent = transform(link.sheet.cssRules);
  link.replaceWith(style);
}
