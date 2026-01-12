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
        this._gridControl = options.gridControl || null;
        this._regionLabelsControl = options.regionLabelsControl || null;
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

    _updateStatusWithSpinner: function (element, status) {
        if (!element) return;

        if (status && status.toLowerCase().includes('loading')) {
            element.innerHTML = '<span class="loading-spinner"></span>' + status;
        } else {
            element.textContent = status || '';
        }
    },
});
