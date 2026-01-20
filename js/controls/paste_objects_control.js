'use strict';

export const PasteObjectsControl = L.Control.extend({
    options: {
        position: 'topright',
    },

    initialize: function (options) {
        L.setOptions(this, options);
        this._markers = [];
        this._objects = [];
        this._filters = {
            name: '',
            id: '',
            action: '',
        };
    },

    onAdd: function (map) {
        this._map = map;
        const container = L.DomUtil.create('div', 'paste-objects-panel');

        const toggleBtn = L.DomUtil.create('button', 'paste-objects-toggle', container);
        toggleBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z"/>
        </svg>`;
        toggleBtn.title = 'Paste Objects (P)';
        this._toggleBtn = toggleBtn;

        const panel = L.DomUtil.create('div', 'paste-objects-content', container);

        const header = L.DomUtil.create('div', 'paste-objects-header', panel);
        header.innerHTML = '<span class="paste-objects-title">Paste Objects</span>';

        const body = L.DomUtil.create('div', 'paste-objects-body', panel);

        const textarea = L.DomUtil.create('textarea', 'paste-objects-textarea', body);
        textarea.placeholder = 'Paste object data here...\n\nFormat:\nObject ID: 37, Name: Gate, Actions: [Open, null, ...], Coords: (2595, 1465, 0)';
        textarea.spellcheck = false;
        this._textarea = textarea;

        const controls = L.DomUtil.create('div', 'paste-objects-controls', body);

        const loadBtn = L.DomUtil.create('button', 'paste-objects-btn paste-objects-btn-primary', controls);
        loadBtn.textContent = 'Load';

        const importBtn = L.DomUtil.create('button', 'paste-objects-btn paste-objects-btn-import', controls);
        importBtn.textContent = 'Import';

        const fileInput = L.DomUtil.create('input', 'paste-objects-file-input', controls);
        fileInput.type = 'file';
        fileInput.accept = '.txt';
        this._fileInput = fileInput;

        const clearBtn = L.DomUtil.create('button', 'paste-objects-btn paste-objects-btn-secondary', controls);
        clearBtn.textContent = 'Clear';

        const filterSection = L.DomUtil.create('div', 'paste-objects-filters', body);
        this._filterSection = filterSection;
        filterSection.style.display = 'none';

        const filterHeader = L.DomUtil.create('div', 'paste-objects-filter-header', filterSection);
        filterHeader.textContent = 'Filters';

        const filterGrid = L.DomUtil.create('div', 'paste-objects-filter-grid', filterSection);

        const nameFilter = this._createFilterInput(filterGrid, 'Name', 'name', 'e.g. Gate, Door*');
        const idFilter = this._createFilterInput(filterGrid, 'ID', 'id', 'e.g. 37, 100-200');
        const actionFilter = this._createFilterInput(filterGrid, 'Action', 'action', 'regex: pick[-\\s]?lock, open|close');

        this._nameInput = nameFilter;
        this._idInput = idFilter;
        this._actionInput = actionFilter;

        const filterControls = L.DomUtil.create('div', 'paste-objects-filter-controls', filterSection);

        const applyBtn = L.DomUtil.create('button', 'paste-objects-btn paste-objects-btn-filter', filterControls);
        applyBtn.textContent = 'Apply';

        const resetBtn = L.DomUtil.create('button', 'paste-objects-btn paste-objects-btn-secondary', filterControls);
        resetBtn.textContent = 'Reset';

        const exportBtn = L.DomUtil.create('button', 'paste-objects-btn paste-objects-btn-export', filterControls);
        exportBtn.textContent = 'Export';

        const filterStatus = L.DomUtil.create('div', 'paste-objects-filter-status', filterSection);
        this._filterStatusEl = filterStatus;

        const status = L.DomUtil.create('div', 'paste-objects-status', body);
        this._statusEl = status;

        let panelVisible = false;
        L.DomEvent.on(toggleBtn, 'click', (e) => {
            L.DomEvent.stopPropagation(e);
            panelVisible = !panelVisible;
            panel.classList.toggle('visible', panelVisible);
            toggleBtn.classList.toggle('active', panelVisible);
        });

        L.DomEvent.on(loadBtn, 'click', (e) => {
            L.DomEvent.stopPropagation(e);
            this._parseAndLoad();
        });

        L.DomEvent.on(importBtn, 'click', (e) => {
            L.DomEvent.stopPropagation(e);
            fileInput.click();
        });

        L.DomEvent.on(fileInput, 'change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this._loadFile(file);
            }
            fileInput.value = '';
        });

        L.DomEvent.on(clearBtn, 'click', (e) => {
            L.DomEvent.stopPropagation(e);
            this._clearObjects();
            this._textarea.value = '';
            this._textarea.style.display = '';
            this._resetFilters();
            this._filterSection.style.display = 'none';
            this._setStatus('Cleared', 'info');
        });

        L.DomEvent.on(applyBtn, 'click', (e) => {
            L.DomEvent.stopPropagation(e);
            this._applyFilters();
        });

        L.DomEvent.on(resetBtn, 'click', (e) => {
            L.DomEvent.stopPropagation(e);
            this._resetFilters();
            this._applyFilters();
        });

        L.DomEvent.on(exportBtn, 'click', (e) => {
            L.DomEvent.stopPropagation(e);
            this._exportFiltered();
        });

        [nameFilter, idFilter, actionFilter].forEach(input => {
            L.DomEvent.on(input, 'keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this._applyFilters();
                }
            });
        });

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        map.on('planechange', () => this._updateMarkersForPlane());

        return container;
    },

    _createFilterInput: function (parent, label, key, placeholder) {
        const wrapper = L.DomUtil.create('div', 'paste-objects-filter-item', parent);

        const labelEl = L.DomUtil.create('label', 'paste-objects-filter-label', wrapper);
        labelEl.textContent = label;

        const input = L.DomUtil.create('input', 'paste-objects-filter-input', wrapper);
        input.type = 'text';
        input.placeholder = placeholder;
        input.dataset.filterKey = key;

        return input;
    },

    _loadFile: function (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            this._textarea.style.display = 'none';
            this._parseText(e.target.result);
        };
        reader.onerror = () => {
            this._setStatus('Failed to read file', 'error');
        };
        reader.readAsText(file);
    },

    _parseAndLoad: function () {
        const text = this._textarea.value.trim();
        if (!text) {
            this._setStatus('No data to parse', 'error');
            return;
        }
        this._parseText(text);
    },

    _parseText: function (text) {
        this._clearObjects();

        const lines = text.split('\n').filter(line => line.trim());
        const parsed = [];

        for (const line of lines) {
            const obj = this._parseLine(line);
            if (obj) {
                parsed.push(obj);
            }
        }

        if (parsed.length === 0) {
            this._setStatus('No valid objects found', 'error');
            return;
        }

        this._objects = parsed;
        this._createMarkers();
        this._filterSection.style.display = 'block';
        this._setStatus(`Loaded ${parsed.length} objects`, 'success');
    },

    _parseLine: function (line) {
        const idMatch = line.match(/Object ID:\s*(\d+)/i);
        const nameMatch = line.match(/Name:\s*([^,]+)/i);
        const actionsMatch = line.match(/Actions:\s*\[([^\]]*)\]/i);
        const coordsMatch = line.match(/Coords:\s*\(([^)]+)\)/i);

        if (!idMatch || !nameMatch || !coordsMatch) {
            return null;
        }

        const id = parseInt(idMatch[1], 10);
        const name = nameMatch[1].trim();

        let actions = [];
        if (actionsMatch) {
            actions = actionsMatch[1].split(',').map(a => {
                const trimmed = a.trim();
                return trimmed === 'null' ? null : trimmed;
            }).filter(a => a !== null);
        }

        const coordParts = coordsMatch[1].split(',').map(c => parseInt(c.trim(), 10));
        if (coordParts.length < 2 || coordParts.some(isNaN)) {
            return null;
        }

        return {
            id: id,
            name: name,
            actions: actions,
            x: coordParts[0],
            y: coordParts[1],
            plane: coordParts.length > 2 ? coordParts[2] : 0,
        };
    },

    _createMarkers: function () {
        const currentPlane = this._map.getPlane();

        for (const obj of this._objects) {
            const marker = L.circleMarker([obj.y - 0.5, obj.x + 0.5], {
                radius: 6,
                color: '#ff6b35',
                fillColor: '#ff6b35',
                fillOpacity: 0.8,
                weight: 2,
                pane: 'markerPane',
            });

            const actionsStr = obj.actions.length > 0 ? obj.actions.join(', ') : 'None';
            const tooltipContent = `
                <div class="pasted-object-tooltip">
                    <div class="pasted-object-name">${obj.name}</div>
                    <div class="pasted-object-id">ID: ${obj.id}</div>
                    <div class="pasted-object-actions">Actions: ${actionsStr}</div>
                    <div class="pasted-object-coords">(${obj.x}, ${obj.y}, ${obj.plane})</div>
                </div>
            `;

            marker.bindTooltip(tooltipContent, {
                direction: 'top',
                className: 'pasted-object-tooltip-container',
                offset: [0, -8],
            });

            marker._objectData = obj;
            marker._objectPlane = obj.plane;
            marker._filtered = false;

            if (obj.plane === currentPlane) {
                marker.addTo(this._map);
            }

            this._markers.push(marker);
        }
    },

    _applyFilters: function () {
        const namePattern = this._nameInput.value.trim().toLowerCase();
        const idPattern = this._idInput.value.trim();
        const actionPattern = this._actionInput.value.trim().toLowerCase();

        const currentPlane = this._map.getPlane();
        let visibleCount = 0;
        let totalOnPlane = 0;

        for (const marker of this._markers) {
            const obj = marker._objectData;
            if (obj.plane === currentPlane) {
                totalOnPlane++;
            }

            let matches = true;

            if (namePattern && matches) {
                matches = this._matchesPattern(obj.name.toLowerCase(), namePattern);
            }

            if (idPattern && matches) {
                matches = this._matchesIdPattern(obj.id, idPattern);
            }

            if (actionPattern && matches) {
                matches = this._matchesActionRegex(obj.actions, actionPattern);
            }

            marker._filtered = !matches;

            if (obj.plane === currentPlane) {
                if (matches) {
                    if (!this._map.hasLayer(marker)) {
                        marker.addTo(this._map);
                    }
                    visibleCount++;
                } else {
                    if (this._map.hasLayer(marker)) {
                        this._map.removeLayer(marker);
                    }
                }
            }
        }

        this._setFilterStatus(`Showing ${visibleCount} of ${totalOnPlane} on plane ${currentPlane}`);
    },

    _matchesPattern: function (text, pattern) {
        if (pattern.includes('*')) {
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$', 'i');
            return regex.test(text);
        }
        return text.includes(pattern);
    },

    _matchesIdPattern: function (id, pattern) {
        if (pattern.includes('-')) {
            const parts = pattern.split('-').map(p => parseInt(p.trim(), 10));
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                return id >= parts[0] && id <= parts[1];
            }
        }

        if (pattern.includes(',')) {
            const ids = pattern.split(',').map(p => parseInt(p.trim(), 10)).filter(n => !isNaN(n));
            return ids.includes(id);
        }

        const exactId = parseInt(pattern, 10);
        if (!isNaN(exactId)) {
            return id === exactId;
        }

        return true;
    },

    _matchesActionRegex: function (actions, pattern) {
        try {
            const regex = new RegExp(pattern, 'i');
            return actions.some(action => regex.test(action));
        } catch (e) {
            return actions.some(action => action.toLowerCase().includes(pattern.toLowerCase()));
        }
    },

    _exportFiltered: function () {
        const filtered = this._markers
            .filter(m => !m._filtered)
            .map(m => m._objectData);

        if (filtered.length === 0) {
            this._setStatus('No objects to export', 'error');
            return;
        }

        const lines = filtered.map(obj => {
            const actions = obj.actions.length > 0
                ? obj.actions.map(a => a || 'null').join(', ')
                : 'null, null, null, null, null';
            return `Object ID: ${obj.id}, Name: ${obj.name}, Actions: [${actions}], Coords: (${obj.x}, ${obj.y}, ${obj.plane})`;
        });

        const content = lines.join('\n');
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `objects_export_${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this._setStatus(`Exported ${filtered.length} objects`, 'success');
    },

    _resetFilters: function () {
        this._nameInput.value = '';
        this._idInput.value = '';
        this._actionInput.value = '';
        this._setFilterStatus('');
    },

    _setFilterStatus: function (message) {
        if (this._filterStatusEl) {
            this._filterStatusEl.textContent = message;
        }
    },

    _updateMarkersForPlane: function () {
        const currentPlane = this._map.getPlane();

        for (const marker of this._markers) {
            const shouldShow = marker._objectPlane === currentPlane && !marker._filtered;

            if (shouldShow) {
                if (!this._map.hasLayer(marker)) {
                    marker.addTo(this._map);
                }
            } else {
                if (this._map.hasLayer(marker)) {
                    this._map.removeLayer(marker);
                }
            }
        }

        if (this._objects.length > 0) {
            this._applyFilters();
        }
    },

    _clearObjects: function () {
        for (const marker of this._markers) {
            if (this._map.hasLayer(marker)) {
                this._map.removeLayer(marker);
            }
        }
        this._markers = [];
        this._objects = [];
    },

    _setStatus: function (message, type) {
        if (!this._statusEl) return;
        this._statusEl.textContent = message;
        this._statusEl.className = 'paste-objects-status';
        if (type) {
            this._statusEl.classList.add(`status-${type}`);
        }

        if (type === 'success' || type === 'info') {
            setTimeout(() => {
                if (this._statusEl.textContent === message) {
                    this._statusEl.textContent = '';
                }
            }, 3000);
        }
    },

    toggle: function () {
        const panel = this._toggleBtn.parentNode.querySelector('.paste-objects-content');
        const isVisible = panel.classList.contains('visible');
        panel.classList.toggle('visible', !isVisible);
        this._toggleBtn.classList.toggle('active', !isVisible);
    },

    getObjectCount: function () {
        return this._objects.length;
    },
});
