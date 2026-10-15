// Registers the two editor elements and their strings. Element tag names are part of the compatibility contract
// (HA creates them through getConfigElement; the browser suite creates them directly).
import {defineOnce} from '../define.js';
import {registerStrings} from '../core/i18n.js';
import {HouseViewEditor} from './carousel-editor.js';
import {ensureNativeEditors} from './native-stack.js';
import strings from './strings.js';
import {HouseViewWidgetEditor} from './widget-editor.js';

registerStrings(strings);
defineOnce('houseview-editor', HouseViewEditor);
defineOnce('houseview-widget-editor', HouseViewWidgetEditor);

export {HouseViewEditor, HouseViewWidgetEditor, ensureNativeEditors};
