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

    show: function ({ name, type, id, actions, coords }) {
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
