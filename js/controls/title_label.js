'use strict';

export const TitleLabel = L.Control.extend({
    options: {
        position: 'topleft'
    },

    onAdd: function (map) {
        const container = L.DomUtil.create('div');
        container.id = 'titleLabel';
        container.innerHTML = "RS3 Map";

        L.DomEvent.disableClickPropagation(container);
        return container;
    }
});