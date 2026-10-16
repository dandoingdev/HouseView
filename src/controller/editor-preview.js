import {editorPreviewFor} from '../core/editor-preview.js';
import {inCardPreview} from './screen-model.js';

export const editorPreviewMixin = {
  _syncEditorPreview(force = false) {
    if (
      !this._config ||
      this._config.single_widget ||
      !this._hass ||
      !inCardPreview(this) ||
      this._syncingEditorPreview
    )
      return;
    const target = editorPreviewFor(this);
    if (!target && !this._editorPreviewKey) return;
    const key = JSON.stringify(target);
    if (!force && key === this._editorPreviewKey && this._editorPreviewConfig === this._config)
      return;
    this._editorPreviewKey = key;
    this._editorPreviewConfig = this._config;
    this._syncingEditorPreview = true;
    try {
      // Replace immediately: the previous screen must never cover the one being edited.
      if (this._screensaver?.active) this._screensaver.idle?.wake('replace');
      if (this._screensaver) this._screensaverRemoveLayer(this._screensaver);
      if (this._galleryOpen) {
        this._galleryOpen = false;
        this._galleryCamera = null;
        this._renderWidgets();
      }
      if (target?.kind === 'page') {
        this._renderWidgets();
      } else if (target?.kind === 'overview' && target.type) {
        this._screensaverOpenType(target.type, target.options || {});
      } else if (target?.kind === 'cameras' && this._config.camera_gallery?.length) {
        this._galleryOpen = true;
        this._galleryCamera = null;
        this._renderWidgets();
      }
    } finally {
      this._syncingEditorPreview = false;
    }
  }
};
