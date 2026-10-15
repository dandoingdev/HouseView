// Stub of the generated index (see tools/gen-widgets.mjs): one import per folder, then register.
import {registerWidget} from '../core/registry.js';
import bad_actionWidget from './bad_action/index.js';
import bad_actionStrings from './bad_action/strings.js';
import bad_clockWidget from './bad_clock/index.js';
import bad_clockStrings from './bad_clock/strings.js';
import bad_domWidget from './bad_dom/index.js';
import bad_domStrings from './bad_dom/strings.js';
import bad_enabledWidget from './bad_enabled/index.js';
import bad_enabledStrings from './bad_enabled/strings.js';
import bad_escapeWidget from './bad_escape/index.js';
import bad_escapeStrings from './bad_escape/strings.js';
import bad_mutateWidget from './bad_mutate/index.js';
import bad_mutateStrings from './bad_mutate/strings.js';
import bad_nameWidget from './bad_name/index.js';
import bad_nameStrings from './bad_name/strings.js';
import bad_norootWidget from './bad_noroot/index.js';
import bad_norootStrings from './bad_noroot/strings.js';
import coverWidget from './cover/index.js';
import coverStrings from './cover/strings.js';
import lightWidget from './light/index.js';
import lightStrings from './light/strings.js';

export const widgets = [
  bad_actionWidget,
  bad_clockWidget,
  bad_domWidget,
  bad_enabledWidget,
  bad_escapeWidget,
  bad_mutateWidget,
  bad_nameWidget,
  bad_norootWidget,
  coverWidget,
  lightWidget
];
const strings = {
  bad_action: bad_actionStrings,
  bad_clock: bad_clockStrings,
  bad_dom: bad_domStrings,
  bad_enabled: bad_enabledStrings,
  bad_escape: bad_escapeStrings,
  bad_mutate: bad_mutateStrings,
  bad_name: bad_nameStrings,
  bad_noroot: bad_norootStrings,
  cover: coverStrings,
  light: lightStrings
};
for (const definition of widgets) registerWidget(definition, strings[definition.type]);
