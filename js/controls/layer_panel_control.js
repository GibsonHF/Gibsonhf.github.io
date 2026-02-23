'use strict';

const TRANSPORT_COLORS = {
    door: '#e67e22',
    item: '#3498db',
    lodestone: '#f1c40f',
    npc: '#1abc9c',
    object: '#9b59b6',
    fairy_ring: '#ff6ad5',
};

export const LayerPanelControl = L.Control.extend({
    options: {
        position: 'topright',
    },

    initialize: function (options) {
        L.setOptions(this, options);
        this._mapLayer = options.mapLayer || null;
        this._iconLayer = options.iconLayer || null;
        this._walkableControl = options.walkableControl || null;
        this._transportControl = options.transportControl || null;
        this._rs3TransportControl = options.rs3TransportControl || null;
        this._gridControl = options.gridControl || null;
        this._regionLabelsControl = options.regionLabelsControl || null;
        this._npcPositionsControl = options.npcPositionsControl || null;
        this._objectExplorerControl = options.objectExplorerControl || null;
    },

    onAdd: function (map) {
        const container = L.DomUtil.create('div', 'layer-panel');

        // Panel toggle button
        const toggleBtn = L.DomUtil.create('button', 'layer-panel-toggle', container);
        toggleBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>`;
        toggleBtn.title = 'Toggle Layers Panel';

        // Panel content
        const panel = L.DomUtil.create('div', 'layer-panel-content', container);

        // Header
        const header = L.DomUtil.create('div', 'layer-panel-header', panel);
        header.innerHTML = '<span class="layer-panel-title">Map Layers</span>';

        // Sections container
        const sections = L.DomUtil.create('div', 'layer-panel-sections', panel);

        // Base Layers Section
        this._createSection(sections, 'Base Layers', [
            { id: 'map-tiles', label: 'Map Tiles', checked: true, onChange: (checked) => this._toggleMapLayer(checked) },
            { id: 'map-icons-all', label: 'Map Icons', checked: true, onChange: (checked) => this._toggleIconLayer(checked) },
        ]);

        // Overlay Layers Section
        this._createSection(sections, 'Overlays', [
            { id: 'grid', label: 'Grid Lines', checked: false, color: '#58a6ff', onChange: (checked) => this._toggleGrid(checked) },
            { id: 'region-labels', label: 'Region Labels', checked: false, onChange: (checked) => this._toggleRegionLabels(checked) },
        ]);

        // Walkable Tiles Section
        if (this._walkableControl) {
            const walkableSection = this._createSection(sections, 'Walkable Tiles', [
                { id: 'walkable-tiles', label: 'Show Walkable', checked: false, color: '#2ecc71', onChange: (checked) => this._toggleWalkable(checked) },
            ]);

            // Tile limit slider
            const sliderContainer = L.DomUtil.create('div', 'layer-panel-slider-container', walkableSection);

            const sliderLabel = L.DomUtil.create('div', 'layer-panel-slider-label', sliderContainer);
            sliderLabel.innerHTML = '<span>Tile Limit</span><span id="tile-limit-value">' +
                this._formatNumber(this._walkableControl.getTileLimit()) + '</span>';
            this._tileLimitValueEl = sliderLabel.querySelector('#tile-limit-value');

            const slider = L.DomUtil.create('input', 'layer-panel-range', sliderContainer);
            slider.type = 'range';
            slider.min = this._walkableControl.getMinTileLimit();
            slider.max = this._walkableControl.getMaxTileLimit();
            slider.value = this._walkableControl.getTileLimit();
            slider.step = 10000;

            L.DomEvent.on(slider, 'input', (e) => {
                const value = parseInt(e.target.value);
                this._tileLimitValueEl.textContent = this._formatNumber(value);
            });

            L.DomEvent.on(slider, 'change', (e) => {
                const value = parseInt(e.target.value);
                this._walkableControl.setTileLimit(value);
            });

            // Status indicator
            const walkableStatus = L.DomUtil.create('div', 'layer-panel-status', walkableSection);
            walkableStatus.id = 'walkable-status';
            this._walkableStatusEl = walkableStatus;
        }

        // Transport Nodes Section
        const transportSection = this._createSection(sections, 'Transport Nodes', []);
        const transportItems = L.DomUtil.create('div', 'layer-panel-transport-items', transportSection);

        Object.keys(TRANSPORT_COLORS).forEach(kind => {
            this._createToggleItem(transportItems, {
                id: `transport-${kind}`,
                label: this._formatKindLabel(kind),
                checked: false,
                color: TRANSPORT_COLORS[kind],
                onChange: (checked) => this._toggleTransportKind(kind, checked),
            });
        });

        // Transport status
        const transportStatus = L.DomUtil.create('div', 'layer-panel-status', transportSection);
        transportStatus.id = 'transport-status';
        this._transportStatusEl = transportStatus;

        // RS3 Transport Data Section (from mejrs/data_rs3)
        if (this._rs3TransportControl) {
            const rs3Section = this._createSection(sections, 'RS3 Transport Data', []);
            const rs3Items = L.DomUtil.create('div', 'layer-panel-transport-items', rs3Section);

            const categories = this._rs3TransportControl.getCategories();
            categories.forEach(category => {
                const config = this._rs3TransportControl.getCategoryConfig(category);
                this._createToggleItem(rs3Items, {
                    id: `rs3-transport-${category}`,
                    label: config.label,
                    checked: false,
                    color: config.color,
                    onChange: (checked) => this._toggleRS3Category(category, checked),
                });
            });

            // RS3 transport status
            const rs3Status = L.DomUtil.create('div', 'layer-panel-status', rs3Section);
            rs3Status.id = 'rs3-transport-status';
            this._rs3TransportStatusEl = rs3Status;
        }

        // NPC Positions Section
        if (this._npcPositionsControl) {
            const npcSection = this._createSection(sections, 'NPC Positions', [
                { id: 'npc-positions', label: 'Show NPCs', checked: false, color: '#e74c3c', onChange: (checked) => this._toggleNPCPositions(checked) },
            ]);

            // File input for loading JSON files
            const fileContainer = L.DomUtil.create('div', 'layer-panel-file-container', npcSection);
            const fileInputWrapper = L.DomUtil.create('div', 'layer-panel-file-wrapper', fileContainer);

            const fileInput = L.DomUtil.create('input', 'layer-panel-file-input', fileContainer);
            fileInput.type = 'file';
            fileInput.accept = '.json';
            fileInput.multiple = true;
            fileInput.id = 'npc-file-input';

            const folderInput = L.DomUtil.create('input', 'layer-panel-file-input', fileContainer);
            folderInput.type = 'file';
            folderInput.webkitdirectory = true;
            folderInput.id = 'npc-folder-input';

            const fileButton = L.DomUtil.create('label', 'layer-panel-file-button', fileInputWrapper);
            fileButton.setAttribute('for', 'npc-file-input');
            fileButton.textContent = 'Files';

            const folderButton = L.DomUtil.create('label', 'layer-panel-file-button', fileInputWrapper);
            folderButton.setAttribute('for', 'npc-folder-input');
            folderButton.textContent = 'Folder';

            const clearButton = L.DomUtil.create('button', 'layer-panel-clear-button', fileInputWrapper);
            clearButton.textContent = 'Clear';
            clearButton.title = 'Clear all loaded NPCs';

            const loadFiles = async (files, inputEl) => {
                const jsonFiles = files.filter(f => f.name.endsWith('.json'));
                if (!jsonFiles.length) return;

                const batchSize = 100;
                let loadedCount = 0;
                let errorCount = 0;

                this._npcPositionsControl._setStatus(`Loading 0/${jsonFiles.length}...`);

                for (let i = 0; i < jsonFiles.length; i += batchSize) {
                    const batch = jsonFiles.slice(i, i + batchSize);

                    const results = await Promise.all(
                        batch.map(file => this._npcPositionsControl.loadNPCFile(file).catch(() => false))
                    );

                    loadedCount += results.filter(Boolean).length;
                    errorCount += results.filter(r => !r).length;

                    this._npcPositionsControl._setStatus(`Loading ${Math.min(i + batchSize, jsonFiles.length)}/${jsonFiles.length}...`);

                    await new Promise(r => setTimeout(r, 10));
                }

                this._npcPositionsControl.finishBulkLoad();

                if (loadedCount > 0 && !this._npcPositionsControl.isEnabled()) {
                    document.getElementById('npc-positions').checked = true;
                    this._npcPositionsControl.setEnabled(true);
                }

                if (errorCount > 0) {
                    console.warn(`Failed to load ${errorCount} files`);
                }

                inputEl.value = '';
            };

            L.DomEvent.on(fileInput, 'change', (e) => loadFiles(Array.from(e.target.files), fileInput));
            L.DomEvent.on(folderInput, 'change', (e) => loadFiles(Array.from(e.target.files), folderInput));

            L.DomEvent.on(clearButton, 'click', () => {
                this._npcPositionsControl.clearData();
            });

            // NPC status
            const npcStatus = L.DomUtil.create('div', 'layer-panel-status', npcSection);
            npcStatus.id = 'npc-positions-status';
            this._npcPositionsStatusEl = npcStatus;
        }

        if (this._objectExplorerControl) {
            const objectExplorerSection = this._createSection(sections, 'Object Explorer', [
                { id: 'object-explorer', label: 'Show Objects', checked: false, color: '#38d3cf', onChange: (checked) => this._toggleObjectExplorer(checked) },
            ]);

            const objectExplorerStatus = L.DomUtil.create('div', 'layer-panel-status', objectExplorerSection);
            objectExplorerStatus.id = 'object-explorer-status';
            this._objectExplorerStatusEl = objectExplorerStatus;
        }

        // Toggle panel visibility
        let panelVisible = false;
        L.DomEvent.on(toggleBtn, 'click', (e) => {
            L.DomEvent.stopPropagation(e);
            panelVisible = !panelVisible;
            panel.classList.toggle('visible', panelVisible);
            toggleBtn.classList.toggle('active', panelVisible);
        });

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        // Setup status callbacks with loading spinner support
        if (this._walkableControl) {
            this._walkableControl.onStatusChange = (status) => {
                this._updateStatusWithSpinner(this._walkableStatusEl, status);
            };
        }

        if (this._transportControl) {
            this._transportControl.onStatusChange = (status) => {
                this._updateStatusWithSpinner(this._transportStatusEl, status);
            };
        }

        if (this._rs3TransportControl) {
            this._rs3TransportControl.onStatusChange = (status) => {
                this._updateStatusWithSpinner(this._rs3TransportStatusEl, status);
            };
        }

        if (this._npcPositionsControl) {
            this._npcPositionsControl.onStatusChange = (status) => {
                this._updateStatusWithSpinner(this._npcPositionsStatusEl, status);
            };
        }

        if (this._objectExplorerControl) {
            this._objectExplorerControl.onStatusChange = (status) => {
                this._updateStatusWithSpinner(this._objectExplorerStatusEl, status);
            };
        }

        return container;
    },

    _createSection: function (parent, title, items) {
        const section = L.DomUtil.create('div', 'layer-panel-section', parent);
        const sectionHeader = L.DomUtil.create('div', 'layer-panel-section-header', section);
        sectionHeader.textContent = title;

        const sectionContent = L.DomUtil.create('div', 'layer-panel-section-content', section);

        items.forEach(item => {
            this._createToggleItem(sectionContent, item);
        });

        return section;
    },

    _createToggleItem: function (parent, options) {
        const item = L.DomUtil.create('label', 'layer-panel-item', parent);

        const toggle = L.DomUtil.create('div', 'layer-panel-toggle-switch', item);
        const checkbox = L.DomUtil.create('input', '', toggle);
        checkbox.type = 'checkbox';
        checkbox.id = options.id;
        checkbox.checked = options.checked;

        const slider = L.DomUtil.create('span', 'layer-panel-slider', toggle);
        if (options.color) {
            slider.style.setProperty('--toggle-color', options.color);
        }

        const labelContent = L.DomUtil.create('div', 'layer-panel-item-content', item);

        if (options.color) {
            const colorDot = L.DomUtil.create('span', 'layer-panel-color-dot', labelContent);
            colorDot.style.backgroundColor = options.color;
        }

        const labelText = L.DomUtil.create('span', 'layer-panel-item-label', labelContent);
        labelText.textContent = options.label;

        L.DomEvent.on(checkbox, 'change', () => {
            if (options.onChange) {
                options.onChange(checkbox.checked);
            }
        });

        return item;
    },

    _formatKindLabel: function (kind) {
        return kind.split('_').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    },

    _formatNumber: function (num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(0) + 'K';
        }
        return num.toString();
    },

    _toggleMapLayer: function (visible) {
        if (this._mapLayer) {
            this._mapLayer.setOpacity(visible ? 1 : 0);
        }
    },

    _toggleIconLayer: function (visible) {
        if (this._iconLayer) {
            this._iconLayer.setOpacity(visible ? 1 : 0);
        }
    },

    _toggleGrid: function (visible) {
        if (this._gridControl) {
            this._gridControl.setEnabled(visible);
        }
    },

    _toggleRegionLabels: function (visible) {
        if (this._regionLabelsControl) {
            this._regionLabelsControl.setEnabled(visible);
        }
    },

    _toggleWalkable: function (visible) {
        if (this._walkableControl) {
            this._walkableControl.setEnabled(visible);
        }
    },

    _toggleTransportKind: function (kind, visible) {
        if (this._transportControl) {
            this._transportControl.setKindEnabled(kind, visible);
        }
    },

    _toggleRS3Category: function (category, visible) {
        if (this._rs3TransportControl) {
            this._rs3TransportControl.setCategoryEnabled(category, visible);
        }
    },

    _toggleNPCPositions: function (visible) {
        if (this._npcPositionsControl) {
            this._npcPositionsControl.setEnabled(visible);
        }
    },

    _toggleObjectExplorer: function (visible) {
        if (this._objectExplorerControl) {
            this._objectExplorerControl.setEnabled(visible);
        }
    },

    _updateStatusWithSpinner: function (element, status) {
        if (!element) return;

        if (status && status.toLowerCase().includes('loading')) {
            element.innerHTML = '<span class="loading-spinner"></span>' + status;
        } else {
            element.textContent = status || '';
        }
    },
});
