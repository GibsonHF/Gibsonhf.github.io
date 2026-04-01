'use strict';

import {Position} from './Position.js';

class Locations {

    constructor() {
        this.locations = [];
        this._loading = false;
        this._pending = [];
    }
    
    getLocations(callback) {
        if (this.locations.length > 0) {
            callback(this.locations);
            return;
        }

        this._pending.push(callback);

        if (this._loading) return;
        this._loading = true;
        
        $.ajax({
            url: "resources/rs3_locations.json",
            dataType: "json",
            context: this,
            success: function( data ) {
                var locations = data["locations"];
                
                for (var i in locations) {
                    this.locations.push({
                        "name": locations[i].name,
                        "position": new Position(locations[i].coords[0], locations[i].coords[1], locations[i].coords[2]),
                        "size": locations[i].size
                    });
                }

                var callbacks = this._pending.splice(0);
                for (var j = 0; j < callbacks.length; j++) {
                    callbacks[j](this.locations);
                }
            }
        });
    }
}

export default (new Locations);