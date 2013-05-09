define([
   './eucadialogview',
   'text!./attach_volume_dialog.html!strip',
   'models/volume',
   'app',
   'backbone',
], function(EucaDialogView, template, Volume, App, Backbone) {
    return EucaDialogView.extend({

        // GENERATE HASHMAP WITH POSSIBLE DEVICE NAMES FOR ATTACH VOLUME OPERATION
        _generateRecommendedDeviceNames : function(count) {
            possibleNames = {};
            for(i=0; i<11 && i<=count; i++){    // Generate char 'f' to 'p'
              possibleNames['/dev/sd'+String.fromCharCode(102+i)] = 1;
            }
            return possibleNames;
        },

        // LEGACY CODE FOR PROVIDING SUGGESTED DEVICE NAME FOR ATTACH VOLUME OPERATION
        _suggestNextDeviceName : function(instanceId) {
            var instance = App.data.instance.get(instanceId);   // ISSUE: Fails to quickly obtain up-to-date device information due to delay -- Kyo 040813
            if(instance == undefined){
              return 'error';
            }
            var instanceObj = instance.get('block_device_mapping');
            var count = _.size(instanceObj) + 1;
            possibleNames = this._generateRecommendedDeviceNames(count);
            for(device in instanceObj){
              possibleNames[device] = 0;     // Zero out the hashmap for existing device names
            }
            for(n in possibleNames){
              if(possibleNames[n] == 1){    // Pick the first string with the open hash item
                return n;
              }
            }
            return 'error';
        },

        // SET UP THE NEXT DEVICE NAME GIVEN THE INSTANCE ID
        setupNextDeviceName: function(args){
          var self = this;
          var deviceName = self._suggestNextDeviceName(args.instance_id);
          self.scope.volume.set({device: deviceName});
        },

        // SET UP AUTOCOMPLETE FOR THE VOLUME INPUT BOX
        setupAutoCompleteForVolumeInputBox: function(args){
            var self = this;

            var vol_ids = [];
            App.data.volume.each(function(item){
              if( item.get('status') === 'available' ){
                // TRY TO FIND ITS NAME TAG
                var nameTag = self.findNameTag(item);
                var autocomplete_string = String(self.createIdNameTagString(item.get('id'), nameTag));
                vol_ids.push(autocomplete_string);
              }
            });
            var sorted = sortArray(vol_ids);
            var $volumeSelector = this.$el.find('#volume-attach-volume-id');
            $volumeSelector.autocomplete({
              source: sorted
           });
        },

        // SET UP AUTOCOMPLETE FOR THE INSTANCE INPUT BOX
        setupAutoCompleteForInstanceInputBox: function(args){
            var self = this;

            var inst_ids = [];
            App.data.instance.each(function(item){
              if( item.get('_state').name === 'running' ){
                // TRY TO FIND ITS NAME TAG
                var nameTag = self.findNameTag(item);
                var autocomplete_string = String(self.createIdNameTagString(item.get('id'), nameTag));
                inst_ids.push(autocomplete_string);
              }
            });

            var sorted = sortArray(inst_ids);

            var $instanceSelector = this.$el.find('#volume-attach-instance-id');
            $instanceSelector.autocomplete({
              source: sorted,
              select: function(event, ui){
                var selected_instance_id = ui.item.value.split(" ")[0];
                var deviceName = self._suggestNextDeviceName(selected_instance_id);
                self.scope.volume.set({device: deviceName});
              }
            });
        },

        disableVolumeInputBox: function(){
          var $volumeSelector = this.$el.find('#volume-attach-volume-id');
          $volumeSelector.attr('disabled', 'disabled');
        },

        disableInstanceInputBox: function(){
          var $instanceSelector = this.$el.find('#volume-attach-instance-id');
          $instanceSelector.attr('disabled', 'disabled');
        },

        // SET UP AUTOCOMPLETE FOR INPUT BOXES
        setupAutoComplete: function(args){
            var self = this;

            // CASE: WHEN CALLED FROM THE INSTANCE PAGE
            if( args.volume_id == undefined ){
              // SET UP THE AUTOCOMPLETE FOR VOLUME INPUT BOX
              this.setupAutoCompleteForVolumeInputBox(args);
              // DISCOVER THE NEXT DEVICE NAME FOR THE INSTANCE
              this.setupNextDeviceName(args);
              // DISABLE THE INSTANCE INPUT BOX
              this.disableInstanceInputBox();
              // DISPLAY ITS NAME TAG FOR INSTANCE ID
              var foundNameTag = self.findNameTag(App.data.instance.get(args.instance_id));
              self.scope.volume.set({instance_id: String(self.createIdNameTagString(args.instance_id, foundNameTag))});
            };

            // CASE: WHEN CALLED FROM THE VOLUME PAGE
            if( args.instance_id == undefined ){
              // SET UP THE AUTOCOMPLETE FOR INSTANCE INPUT BOX
              this.setupAutoCompleteForInstanceInputBox(args);
              // DISABLE THE VOLUME INPUT BOX
              this.disableVolumeInputBox();
              // DISPLAY ITS NAME TAG FOR VOLUME ID
              var foundNameTag = self.findNameTag(App.data.volume.get(args.volume_id));
              self.scope.volume.set({volume_id: String(self.createIdNameTagString(args.volume_id, foundNameTag))});
            };
 
            // SETUP INPUT VALIDATOR
            self.scope.volume.on('change', function() {
              self.scope.error.clear();
              self.scope.error.set(self.scope.volume.validate());
              console.log("Validation Error: " + JSON.stringify(self.scope.error));
            });
        },

        // CONSTRUCT A STRING THAT DISPLAY BOTH RESOURCE ID AND ITS NAME TAG
        createIdNameTagString: function(resource_id, name_tag){
          var this_string = resource_id;
          if( name_tag != null ){
            this_string += " (" + name_tag + ")";
          }
          return this_string;
        }, 

        // UTILITY FUNCTION TO DISCOVER THE NAME TAG OF CLOUD RESOURCE MODEL
        findNameTag: function(model){
          var nameTag = null;
          model.get('tags').each(function(tag){
            if( tag.get('name').toLowerCase() == 'name' ){
              nameTag = tag.get('value');
            };
          });
          return nameTag;
        },

        // INITIALIZE THE VIEW
        initialize : function(args) {
            var self = this;
            this.template = template;

            this.scope = {
                status: '',
                volume: new Volume({volume_id: args.volume_id, instance_id: args.instance_id, device: args.device}),

               
                error: new Backbone.Model({}),
                help: { content: help_volume.dialog_attach_content, url: help_volume.dialog_attach_content_url },

                cancelButton: {
                  click: function() {
                    self.close();
                    self.cleanup();
                  }
                },

                attachButton: new Backbone.Model({
                  disabled: true,
                  click: function() {
                    // GET THE INPUT FROM THE HTML VIEW
                    var volumeId = self.scope.volume.get('volume_id');
                    var instanceId = self.scope.volume.get('instance_id');
                    var device = self.scope.volume.get('device');

                    // EXTRACT THE RESOURCE ID IF THE NAME TAG WAS FOLLOWED
                    if( volumeId.match(/^\w+-\w+\s+/) ){
                      volumeId = volumeId.split(" ")[0];
                    }
                    if( instanceId.match(/^\w+-\w+\s+/) ){
                      instanceId = instanceId.split(" ")[0];
                    }

                    // CONSTRUCT AJAX CALL RESPONSE OPTIONS
                    var attachAjaxCallResponse = {
		      success: function(data, response, jqXHR){   // AJAX CALL SUCCESS OPTION
		        if(data.results){
		          notifySuccess(null, $.i18n.prop('volume_attach_success', volumeId, instanceId));    // XSS Risk  -- Kyo 040713
		        }else{
		          notifyError($.i18n.prop('volume_attach_error', volumeId, instanceId), undefined_error);   // XSS Risk
		        }
		      },
		      error: function(jqXHR, textStatus, errorThrown){  // AJAX CALL ERROR OPTION
		        notifyError($.i18n.prop('volume_attach_error', volumeId, instanceId), getErrorMessage(jqXHR));   // XSS Risk
		      }
                    };

		    // PERFORM ATTACH CALL OM THE MODEL
                    App.data.volume.get(volumeId).attach(instanceId, device, attachAjaxCallResponse);

	           // DISPLAY THE VOLUME'S STATUS -- FOR DEBUG
		   App.data.volume.each(function(item){
	           });

	          // CLOSE THE DIALOG
	          self.close();
            self.cleanup();
                }
              })

            };

            // override the volume model's normal validation rules for this instance,
            // to enforce required fields in the dialog.
            this.scope.volume.validation.volume_id.required = true;
            this.scope.volume.validation.instance_id.required = true;
            this.scope.volume.validation.device.required = true;
            this.scope.volume.validation.size.required = false;

            this.scope.volume.on('validated', function() {
              self.scope.attachButton.set('disabled', !self.scope.volume.isValid());
            });

            this._do_init();

            this.setupAutoComplete(args);
        },

        cleanup: function() {
            // undo validation overrides -  they leak into other dialogs
            this.scope.volume.validation.volume_id.required = false;
            this.scope.volume.validation.instance_id.required = false;
            this.scope.volume.validation.device.required = false;
            this.scope.volume.validation.size.required = true;
        }
    });
});