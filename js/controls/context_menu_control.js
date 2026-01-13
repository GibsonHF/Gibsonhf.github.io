'use strict';

import { Position } from '../model/Position.js';

export const ContextMenuControl = L.Control.extend({
    options: {
        position: 'topleft',
    },

    initialize: function (options) {
        L.setOptions(this, options);
        this._rs3TransportControl = options.rs3TransportControl;
        this._transportControl = options.transportControl;
        this._menu = null;
        this._currentPosition = null;
        this._previewLayer = null;
    },

    onAdd: function (map) {
        this._map = map;
        this._container = L.DomUtil.create('div');
        this._container.style.display = 'none';

        // Create layer for transport hover preview
        this._previewLayer = L.layerGroup().addTo(map);

        // Listen for right-click on map
        map.on('contextmenu', this._onContextMenu, this);

        // Close menu on left-click elsewhere or escape
        map.on('click', this._closeMenu, this);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this._closeMenu();
        });

        return this._container;
    },

    onRemove: function (map) {
        map.off('contextmenu', this._onContextMenu, this);
        map.off('click', this._closeMenu, this);
        this._closeMenu();
    },

    _onContextMenu: function (e) {
        L.DomEvent.preventDefault(e);
        L.DomEvent.stopPropagation(e);

        this._currentPosition = Position.fromLatLng(e.latlng, this._map.getPlane());
        this._showMenu(e.containerPoint);
    },

    _showMenu: function (containerPoint) {
        this._closeMenu();

        const menu = L.DomUtil.create('div', 'map-context-menu');
        menu.style.left = containerPoint.x + 'px';
        menu.style.top = containerPoint.y + 'px';

        // Copy Coordinates item
        const copyItem = this._createMenuItem(
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>',
            `Copy Coordinates (${this._currentPosition.x}, ${this._currentPosition.y}, ${this._currentPosition.plane})`
        );
        L.DomEvent.on(copyItem, 'click', this._copyCoordinates, this);
        menu.appendChild(copyItem);

        // Separator
        menu.appendChild(this._createSeparator());

        // Nearby Transports item
        const nearbyItem = this._createMenuItem(
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>',
            'Nearby Transports'
        );
        L.DomEvent.on(nearbyItem, 'mouseenter', this._showNearbySubmenu, this);
        L.DomEvent.on(nearbyItem, 'mouseleave', this._hideNearbySubmenu, this);
        nearbyItem.classList.add('has-submenu');
        menu.appendChild(nearbyItem);

        // Append to map container
        this._map.getContainer().appendChild(menu);
        this._menu = menu;

        // Adjust position if menu goes off screen
        this._adjustMenuPosition(menu, containerPoint);

        // Prevent map interaction
        L.DomEvent.disableClickPropagation(menu);
    },

    _createMenuItem: function (iconSvg, label) {
        const item = L.DomUtil.create('div', 'context-menu-item');
        item.innerHTML = `
            <span class="context-menu-item-icon">${iconSvg}</span>
            <span class="context-menu-item-label">${label}</span>
        `;
        return item;
    },

    _createSeparator: function () {
        return L.DomUtil.create('div', 'context-menu-separator');
    },

    _adjustMenuPosition: function (menu, point) {
        const mapContainer = this._map.getContainer();
        const menuRect = menu.getBoundingClientRect();
        const containerRect = mapContainer.getBoundingClientRect();

        // Adjust if goes off right edge
        if (point.x + menuRect.width > containerRect.width) {
            menu.style.left = (point.x - menuRect.width) + 'px';
        }

        // Adjust if goes off bottom edge
        if (point.y + menuRect.height > containerRect.height) {
            menu.style.top = (point.y - menuRect.height) + 'px';
        }
    },

    _closeMenu: function () {
        this._forceHideSubmenu();
        this._clearTransportPreview();
        if (this._menu) {
            this._menu.remove();
            this._menu = null;
        }
    },

    _copyCoordinates: function () {
        const coordText = `${this._currentPosition.x}, ${this._currentPosition.y}, ${this._currentPosition.plane}`;
        navigator.clipboard.writeText(coordText).then(() => {
            this._showToast(`Copied: ${coordText}`);
        });
        this._closeMenu();
    },

    _showNearbySubmenu: async function (e) {
        // Clear any pending hide timeout
        if (this._submenuHideTimeout) {
            clearTimeout(this._submenuHideTimeout);
            this._submenuHideTimeout = null;
        }

        // Don't recreate if already showing
        if (this._submenu) return;

        // Ensure transport data is loaded
        if (this._rs3TransportControl && this._rs3TransportControl._ensureNodes) {
            await this._rs3TransportControl._ensureNodes();
        }

        const nearby = this._getNearbyTransports(
            this._currentPosition.x,
            this._currentPosition.y,
            this._currentPosition.plane,
            50
        );

        const submenu = L.DomUtil.create('div', 'context-menu-submenu');
        const menuItem = e.target.closest('.context-menu-item');
        const menuRect = this._menu.getBoundingClientRect();

        // Position submenu to the right with slight overlap to prevent gap
        submenu.style.left = (menuRect.width - 5) + 'px';
        submenu.style.top = (menuItem.offsetTop - 8) + 'px';

        if (nearby.length === 0) {
            const emptyItem = L.DomUtil.create('div', 'context-menu-item disabled', submenu);
            emptyItem.innerHTML = '<span class="context-menu-item-label">No transports nearby</span>';
        } else {
            // Show all transports in range (scrollable)
            nearby.forEach(transport => {
                const item = L.DomUtil.create('div', 'nearby-transport-item', submenu);
                item.innerHTML = `
                    <span class="nearby-transport-dot" style="background: ${transport.color}; box-shadow: 0 0 4px ${transport.color};"></span>
                    <span class="nearby-transport-name">${transport.groupName || transport.name || 'Transport'}</span>
                    <span class="nearby-transport-distance">${transport.distance}t</span>
                `;

                // Hover preview - show line and marker
                L.DomEvent.on(item, 'mouseenter', () => {
                    this._showTransportPreview(transport);
                });
                L.DomEvent.on(item, 'mouseleave', () => {
                    this._clearTransportPreview();
                });

                L.DomEvent.on(item, 'click', (ev) => {
                    L.DomEvent.stopPropagation(ev);
                    this._goToTransport(transport);
                    this._closeMenu();
                });
            });
        }

        this._menu.appendChild(submenu);
        this._submenu = submenu;

        // Prevent scroll wheel from zooming map when over submenu
        L.DomEvent.on(submenu, 'wheel', (e) => {
            L.DomEvent.stopPropagation(e);
        });

        // Keep submenu open when hovering over it
        L.DomEvent.on(submenu, 'mouseenter', () => {
            if (this._submenuHideTimeout) {
                clearTimeout(this._submenuHideTimeout);
                this._submenuHideTimeout = null;
            }
        });
        L.DomEvent.on(submenu, 'mouseleave', () => {
            this._scheduleSubmenuHide();
        });
    },

    _hideNearbySubmenu: function () {
        // Clear any pending timeout
        if (this._submenuHideTimeout) {
            clearTimeout(this._submenuHideTimeout);
            this._submenuHideTimeout = null;
        }
        // Schedule hide with delay to allow mouse to reach submenu
        this._scheduleSubmenuHide();
    },

    _scheduleSubmenuHide: function () {
        if (this._submenuHideTimeout) return;
        this._submenuHideTimeout = setTimeout(() => {
            if (this._submenu) {
                this._submenu.remove();
                this._submenu = null;
            }
            this._submenuHideTimeout = null;
        }, 150); // 150ms delay to allow mouse movement
    },

    _forceHideSubmenu: function () {
        if (this._submenuHideTimeout) {
            clearTimeout(this._submenuHideTimeout);
            this._submenuHideTimeout = null;
        }
        if (this._submenu) {
            this._submenu.remove();
            this._submenu = null;
        }
    },

    _getNearbyTransports: function (x, y, plane, radius) {
        const nearby = [];

        // RS3 Transport Data
        if (this._rs3TransportControl && this._rs3TransportControl._nodesByPlane) {
            const nodes = this._rs3TransportControl._nodesByPlane.get(plane) || [];
            nodes.forEach(node => {
                const nodeX = node.x !== undefined ? node.x : (node.origin ? node.origin.x : 0);
                const nodeY = node.y !== undefined ? node.y : (node.origin ? node.origin.y : 0);
                const dx = nodeX - x;
                const dy = nodeY - y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance <= radius) {
                    nearby.push({
                        ...node,
                        x: nodeX,
                        y: nodeY,
                        distance: Math.floor(distance),
                        color: node.color || '#3498db',
                        source: 'rs3',
                    });
                }
            });
        }

        // Spreadsheet Transport Data
        if (this._transportControl && this._transportControl._nodesByPlane) {
            const nodes = this._transportControl._nodesByPlane.get(plane) || [];
            nodes.forEach(node => {
                const nodeX = node.x || 0;
                const nodeY = node.y || 0;
                const dx = nodeX - x;
                const dy = nodeY - y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance <= radius) {
                    nearby.push({
                        ...node,
                        distance: Math.floor(distance),
                        color: node.color || '#e67e22',
                        source: 'sheets',
                    });
                }
            });
        }

        return nearby.sort((a, b) => a.distance - b.distance);
    },

    _goToTransport: function (transport) {
        const x = transport.x || transport.origin?.x || 0;
        const y = transport.y || transport.origin?.y || 0;
        this._map.panTo(L.latLng(y + 0.5, x + 0.5));
    },

    _showTransportPreview: function (transport) {
        this._clearTransportPreview();

        const fromX = this._currentPosition.x;
        const fromY = this._currentPosition.y;
        const toX = transport.x || transport.origin?.x || 0;
        const toY = transport.y || transport.origin?.y || 0;
        const color = transport.color || '#3498db';

        // Draw line from current position to transport
        const line = L.polyline([
            L.latLng(fromY + 0.5, fromX + 0.5),
            L.latLng(toY + 0.5, toX + 0.5)
        ], {
            color: color,
            weight: 2,
            opacity: 0.8,
            dashArray: '5, 5',
        });
        this._previewLayer.addLayer(line);

        // Draw marker at transport location
        const marker = L.circleMarker(L.latLng(toY + 0.5, toX + 0.5), {
            radius: 8,
            color: color,
            fillColor: color,
            fillOpacity: 0.8,
            weight: 2,
        });
        this._previewLayer.addLayer(marker);

        // If transport has destination, draw that too
        const dstX = transport.dst_x || transport.destination?.x;
        const dstY = transport.dst_y || transport.destination?.y;
        if (dstX !== undefined && dstY !== undefined) {
            const dstLine = L.polyline([
                L.latLng(toY + 0.5, toX + 0.5),
                L.latLng(dstY + 0.5, dstX + 0.5)
            ], {
                color: color,
                weight: 2,
                opacity: 0.6,
            });
            this._previewLayer.addLayer(dstLine);

            const dstMarker = L.circleMarker(L.latLng(dstY + 0.5, dstX + 0.5), {
                radius: 6,
                color: color,
                fillColor: color,
                fillOpacity: 0.5,
                weight: 2,
            });
            this._previewLayer.addLayer(dstMarker);
        }
    },

    _clearTransportPreview: function () {
        if (this._previewLayer) {
            this._previewLayer.clearLayers();
        }
    },

    _showToast: function (message) {
        // Use existing toast system from map.js
        const existingToast = document.querySelector('.toast-notification');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = 'toast-notification success';
        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add('visible');
        });

        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 200);
        }, 2000);
    },
});
