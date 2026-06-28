'use strict';

import { lookupWiki } from '../services/wiki_service.js';

export const WikiPanelControl = L.Control.extend({
    options: {
        position: 'topright',
    },

    onAdd: function (map) {
        this._map = map;
        this._visible = false;

        const container = L.DomUtil.create('div');
        container.style.display = 'none';

        const panel = document.createElement('div');
        panel.className = 'wiki-panel';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'wiki-panel-close';
        closeBtn.innerHTML = '&times;';
        panel.appendChild(closeBtn);

        const header = document.createElement('div');
        header.className = 'wiki-panel-header';
        panel.appendChild(header);

        const body = document.createElement('div');
        body.className = 'wiki-panel-body';
        panel.appendChild(body);

        document.body.appendChild(panel);

        this._panel = panel;
        this._header = header;
        this._body = body;

        closeBtn.addEventListener('click', () => this.hide());

        this._keyHandler = (e) => {
            if (e.key === 'Escape' && this._visible) this.hide();
        };
        document.addEventListener('keydown', this._keyHandler);

        return container;
    },

    onRemove: function (map) {
        if (this._panel) {
            this._panel.remove();
            this._panel = null;
        }
        if (this._keyHandler) {
            document.removeEventListener('keydown', this._keyHandler);
            this._keyHandler = null;
        }
    },

    show: function ({ name, type, id, actions, coords, details, transforms, doorState }) {
        this._visible = true;
        this._panel.classList.add('visible');

        this._header.innerHTML = '';
        const nameEl = document.createElement('div');
        nameEl.className = 'wiki-panel-name';
        nameEl.textContent = name;
        this._header.appendChild(nameEl);

        if (type) {
            const subtitleEl = document.createElement('div');
            subtitleEl.className = 'wiki-panel-subtitle';
            subtitleEl.textContent = type;
            this._header.appendChild(subtitleEl);
        }

        this._body.innerHTML = '';

        if (id !== undefined && id !== null) this._body.appendChild(this._createRow('Object ID', id));
        if (actions && actions.length) {
            const actionsRow = document.createElement('div');
            actionsRow.className = 'wiki-panel-row';

            const actionsLabel = document.createElement('span');
            actionsLabel.className = 'wiki-panel-label';
            actionsLabel.textContent = 'Actions';
            actionsRow.appendChild(actionsLabel);

            const actionsContainer = document.createElement('div');
            actionsContainer.className = 'wiki-panel-actions';
            actions.forEach((action) => {
                const tag = document.createElement('span');
                tag.className = 'wiki-panel-action-tag';
                tag.textContent = action;
                actionsContainer.appendChild(tag);
            });
            actionsRow.appendChild(actionsContainer);
            this._body.appendChild(actionsRow);
        }
        if (coords) this._body.appendChild(this._createRow('Coordinates', `(${coords.x}, ${coords.y}, ${coords.plane})`));

        if (details) {
            if (details.type !== undefined && details.rotation !== undefined) {
                this._body.appendChild(this._createRow('Type / Rotation', `${details.type} / ${details.rotation}`));
            }
            if (details.width !== undefined && details.length !== undefined) {
                this._body.appendChild(this._createRow('Size', `${details.width} × ${details.length}`));
            }
        }

        if (doorState) {
            const section = document.createElement('div');
            section.className = 'wiki-panel-door';

            const heading = document.createElement('div');
            heading.className = 'wiki-panel-section-title';
            heading.textContent = 'Door state';
            section.appendChild(heading);

            section.appendChild(this._createRow('Opens to', `${doorState.name || 'Door'} (id ${doorState.open_id})`));

            const sourceLabel = doorState.source === 'observed'
                ? 'observed'
                : (doorState.source === 'derived-unique' ? 'cache · high confidence' : 'cache · uncertain');
            section.appendChild(this._createRow('Source', sourceLabel));

            if (doorState.source === 'observed' && doorState.cache_open_id != null && doorState.cache_open_id !== doorState.open_id) {
                const warn = this._createRow('Cache suggests', `id ${doorState.cache_open_id} (your data may be outdated)`);
                const warnVal = warn.querySelector('.wiki-panel-value');
                if (warnVal) warnVal.classList.add('wiki-panel-warn');
                section.appendChild(warn);
            }

            if (doorState.instance) {
                const inst = doorState.instance;
                section.appendChild(this._createRow('Open position', `(${inst.open_x}, ${inst.open_y})`));
                section.appendChild(this._createRow('Connects', `(${inst.inside_x}, ${inst.inside_y}) ↔ (${inst.outside_x}, ${inst.outside_y})`));
            }

            this._body.appendChild(section);
        }

        if (transforms && transforms.length) {
            const section = document.createElement('div');
            section.className = 'wiki-panel-transforms';

            const heading = document.createElement('div');
            heading.className = 'wiki-panel-section-title';
            heading.textContent = 'Transforms';
            section.appendChild(heading);

            transforms.forEach((t) => {
                const slotLabel = t.slot === -1 ? 'default' : `slot ${t.slot}`;
                section.appendChild(this._createRow(slotLabel, `${t.target_name || '(unnamed)'} (id ${t.target_id})`));
            });

            this._body.appendChild(section);
        }

        const wikiSection = document.createElement('div');
        wikiSection.className = 'wiki-panel-loading';
        wikiSection.innerHTML = '<span class="loading-spinner"></span>Loading wiki data...';
        this._body.appendChild(wikiSection);

        lookupWiki(name).then((data) => {
            wikiSection.innerHTML = '';
            wikiSection.className = '';

            if (!data) {
                const err = document.createElement('div');
                err.className = 'wiki-panel-error';
                err.textContent = 'No wiki data found';
                wikiSection.appendChild(err);
                return;
            }

            if (data.examine) wikiSection.appendChild(this._createRow('Examine', data.examine));
            if (data.members) {
                const membersRow = this._createRow('Members', data.members);
                const membersVal = membersRow.querySelector('.wiki-panel-value');
                if (membersVal) {
                    membersVal.classList.add(data.members.toLowerCase() === 'yes' ? 'members-yes' : 'members-no');
                }
                wikiSection.appendChild(membersRow);
            }
            if (data.ids && data.ids.length) wikiSection.appendChild(this._createRow('Wiki IDs', data.ids.join(', ')));
        });
    },

    hide: function () {
        this._visible = false;
        this._panel.classList.remove('visible');
    },

    _createRow: function (label, value) {
        const row = document.createElement('div');
        row.className = 'wiki-panel-row';

        const labelEl = document.createElement('span');
        labelEl.className = 'wiki-panel-label';
        labelEl.textContent = label;

        const valueEl = document.createElement('span');
        valueEl.className = 'wiki-panel-value';
        valueEl.textContent = value;

        row.appendChild(labelEl);
        row.appendChild(valueEl);

        return row;
    },
});
