function fillMetadataPage(clip) {
	const form = $$("id-meta-form");
	form.clearAll();

	//let layouts = $$('id-meta-form').getChildViews();
	//for (var i = 0; i < layouts.length - 1; i++) {
	//	let layout = layouts[i];
	//	i--;
	//	$$('id-meta-form').removeView(layout)
	//}

	var created = new Date(Number(clip.creation_date) * 1000).toISOString();
	var start = Timecode(clip.start.startFrame, clip.start.fps, clip.start.drop).toString();
	var duration = Timecode(clip.duration, clip.start.fps, clip.start.drop).toString();

	form.add({ m_name: "Name", m_value: clip.mmob_name });
	form.add({ m_name: "Created", m_value: created });
	form.add({ m_name: "Tape", m_value: clip.smob_name });
	form.add({ m_name: "Start", m_value: start });
	form.add({ m_name: "Duration", m_value: duration });
	form.add({ m_name: "Video", m_value: clip.video });
	form.add({ m_name: "Tracks", m_value: clip.tracks });
	form.add({ m_name: "Workspace", m_value: clip.workspace });
}

function formatBytes(bytes, decimals = 1, binaryUnits = true) {
	if (bytes == 0) {
		return '0 Bytes';
	}
	var unitMultiple = (binaryUnits) ? 1024 : 1000;
	var unitNames = (unitMultiple === 1024) ? // 1000 bytes in 1 Kilobyte (KB) or 1024 bytes for the binary version (KiB)
		['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'] :
		['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
	var unitChanges = Math.floor(Math.log(bytes) / Math.log(unitMultiple));
	return parseFloat((bytes / Math.pow(unitMultiple, unitChanges)).toFixed(decimals || 0)) + ' ' + unitNames[unitChanges];
}

function showMI() {

	$$("id_mitable").clearAll();
	$$("id_mitable").load("/api/mi/ws/get");
	$$("win-mi").show();
}

function transcode(clip) {

	webix.ajax().post("/api/transcoder/details", JSON.stringify({ mmob_id: clip.mmob_id })).then(function (result) {
		var response = result.json();

		var list = $$("td_video_codec").getPopup().getList();
		list.clearAll();
		list.parse(response.video_codecs);
		$$("td_video_codec").setValue(list.getFirstId());

		var list_ws = $$("td_workspaces").getPopup().getList();
		list_ws.clearAll();
		list_ws.parse(response.workspaces);
		$$("td_workspaces").setValue(list_ws.getFirstId());

		// select style
		//$$("td_video_codec").config.options = response.video_codecs;

		$$("td_mmob_id").setValue(clip.mmob_id);
		$$("td_mmob_name").setValue(clip.mmob_name);
		$$("win-transcode").show();

	}).fail(function (xhr) {
		var response = JSON.parse(xhr.response);
		webix.message({ type: 'error', text: response.error.message });
	});
}

function refreshAssetTable() {
	$$("id_assets").clearAll();
	$$("id_assets").load("idata->/portal/db/assets");
}

function refreshMarkerTable() {
	var table = $$("table_markers");
	table.clearAll();

	if (m_clip == null || m_clip.mmob_id == null) return;

	var update_url = "/portal/db/markers?mmob_id=eq." + m_clip.mmob_id;

	const search_text = $$("markers_search_text").getValue();
	if (search_text) {
		update_url += "&comment=ilike.*" + search_text + "*";
	}

	table.load(update_url).then(function (result) {
		//table.sort("in", "asc");
		//table.markSorting("in", "asc");
	});
}

function updateMarkerColor(marker, new_color) {
	marker.color = new_color;
	$$("table_markers").refresh();
	webix.ajax().post("/api/markers/update", JSON.stringify(marker)).then(function () {
		//refreshMarkerTable();
	});
}

function newMarker(marker_color) {

	var canvas = document.createElement('canvas');
	canvas.width = 480;
	canvas.height = 270;
	canvas.getContext("2d").drawImage(qp_video, 0, 0);

	webix.ajax().post("/api/markers/add", JSON.stringify({
		mmob_id: m_clip.mmob_id,
		color: marker_color,
		in: m_player.currentFrame(),
		headframe: canvas.toDataURL('image/jpeg', 0.5).split(';base64,')[1],
		comment: "",
	})).then(function (result) {
		refreshMarkerTable();
	});

}

webix.ready(function () {

	webix.CustomScroll.init();

	webix.ui({
		view: 'window',
		id: "win-transcode",
		head: 'Transcode',
		modal: true,
		close: true,
		width: 500,
		height: 400,
		borderless: true,
		position: 'center',
		css: "dialog-transcode",
		body: {
			view: 'form',
			rules: {
				"td_mmob_name": webix.rules.isNotEmpty
			},
			elements: [
				{ view: "text", label: "", id: 'td_mmob_id', hidden: true },
				{ view: "text", label: "Name", id: 'td_mmob_name' },
				{ view: "richselect", label: "Video", options: [], id: 'td_video_codec' },
				{ view: "richselect", label: "Workspace", options: [], id: 'td_workspaces' },
				{ view: "checkbox", label: "Burnt-in timecode", id: 'td_burntin' },
				{
					cols: [
						{},
						{
							view: 'button',
							value: 'Transcode',
							click: function (elementId, event) {

								webix.ajax().post("/transcoder/add", JSON.stringify({
									mmob_id: $$("td_mmob_id").getValue(),
									mmob_name: $$("td_mmob_name").getValue(),
									path: $$("td_workspaces").getText(),
									video_codec: $$("td_video_codec").getText(),
									burnt_in: Boolean($$("td_burntin").getValue()),
								}));

								this.getTopParentView().hide();
							}
						},
						{
							view: 'button', value: 'Cancel',
							click: function (elementId, event) {
								this.getTopParentView().hide();
							}
						}
					]
				}
			]
		},
		move: false,
	});

	/* Media Indexer Dialog */
	webix.ui({
		view: 'window',
		id: "win-mi",
		head: 'Media Indexer',
		modal: true,
		close: true,
		borderless: true,
		width: 640,
		height: 350,
		position: 'center',
		css: "dialog-transcode",
		body: {
			view: 'form',
			elements: [
				{
					view: "datatable",
					id: "id_mitable",
					columns: [
						{ id: "scan", header: "Use", template: "{common.checkbox()}" },
						{ id: "path", header: "Workspace", fillspace: true },
						{
							id: "size", header: "Size", template: function (obj) {
								return formatBytes(obj.size);
							}
						},
						{
							id: "free", header: "Free", template: function (obj) {
								return formatBytes(obj.free);
							}
						},
						{ id: "readonly", header: "Read Only" },
					],
					resizeColumn: { headerOnly: true },
					headerRowHeight: 30,
					rowHeight: 30,
					scroll: "xy",
					select: "row",
					url: "/api/mi/ws/get",
				},
				{
					cols: [
						{},
						{
							view: 'button', value: 'OK',
							click: function (elementId, event) {

								var wks = [];
								$$("id_mitable").eachRow(function (row) {
									const record = $$("id_mitable").getItem(row);
									if (record.scan) {
										wks.push(record.path);
									}
								});

								webix.ajax().post("/api/mi/ws/set", JSON.stringify({ workspaces: wks }));

								var list_ws = $$("id_workspaces").getPopup().getList();
								list_ws.clearAll();
								list_ws.parse(wks);

								refreshAssetTable();
								//$$("id_assets").clearAll();
								//$$("id_assets").load("idata->" + url);

								this.getTopParentView().hide();
							}
						},
						{
							view: 'button', value: 'Cancel',
							click: function (elementId, event) {
								this.getTopParentView().hide();
								//this.getParentView().getParentView().hide();
							}
						},
					]
				}
			]
		},
		move: false,
	});

	webix.ui({
		view: "popup",
		id: "app_menu",
		width: 150,
		body: {
			view: "menu", layout: "y",
			data: [
				{ id: "1", value: "Browser" },
				{ id: "2", value: "Jobs" },
				{ id: "3", value: "Settings..." },
				{ id: "4", value: "Logout" }
			],
			on: {
				onMenuItemClick: function (id) {
					this.hide();
					//const val = this.getMenuItem(id).value;
					if (id == "1") $$("id_multiview").setValue("id-page-browser");
					if (id == "2") $$("id_multiview").setValue("id-page-jobs");
					if (id == "3") showMI();
					if (id == "4") {
						webix.ajax().post("/auth/logout").then(function (result) {
							window.location.href = "/login.html";
						});
					}
				},
				//onAfterRender: function () {
				//	this.hide();
				//}
			},
			autoheight: true,
			select: false,
		}
	}).hide();

	webix.protoUI({
		name: "marker",
		$cssName: "video_marker",

		// your logic here
	}, webix.ui.label);

	webix.protoUI({
		name: "qvideo",
		$cssName: "video_player",
		defaults: { controls: false, borderless: true },
	}, webix.ui.video);

	//var url = "/portal/db/assets";

	webix.proxy.wsmulti = {
		$proxy: true,
		load: function (view, callback, params) {
			webix.ajax().headers({})
				.get("/api/mi/ws/get", callback, view).then(function (data) {

					var wks = [];
					wks.push({ id: "1", value: "zz" });
					wks.push({ id: "2", value: "zz" });
					//console.log(wks);
					return wks;

					var js = data.json();
					var new_js = [];

					for (key in js) {
						new_js.push({
							id: key,
							name: js[key].name
						});
					};

					return new_js;
				});
		}
	};

	//define proxy
	webix.proxy.idata = {
		$proxy: true,
		load: function (view, params) {
			this._attachHandlers(view);

			var url = this.source;
			url += (url.indexOf("?") == -1) ? "?" : "&";

			var count = params ? params.count : view.config.datafetch || 0;
			var start = params ? params.start : 0;

			//url will look like "../data.php?count=50&start=51"
			url += "limit=" + count;
			url += start ? "&offset=" + start : "";

			if (params && params.sort) {
				url += "&order=" + params.sort.id + "." + params.sort.dir;
			}

			var wks = $$("id_workspaces").getValue();
			if (wks) {
				//console.log("workspaces:", wks);
				url += "&or=(";
				const items = wks.split(',');
				var i;
				for (i = 0; i < items.length; i++) {
					url += "workspace.eq.";
					url += items[i];
					if (i != (items.length - 1)) url += ",";
				}
				url += ")";
				//?or = (status.eq.DONE, status.eq.ERROR)
			}

			const search_text = $$("id-assets-text").getValue();
			if (search_text) {
				url += "&mmob_name=ilike.*" + search_text + "*";
			}

			//console.log(url);

			return webix.ajax(url).then(webix.bind(function (data) {
				/*
				here the url outputs data in a classic format {data:[], pos:0, total_count:999}
				we take only data arry from it to emulate dynamic loading without knowing the total count
				 */
				data = data.json();
				this._checkLoadNext(data);
				return data;
			}, this));
		},
		_checkLoadNext: function (data) {

			//data = data;
			var length = Object.keys(data).length;

			if (!length)
				this._dontLoadNext = true;
		},
		_attachHandlers: function (view) {
			var proxy = this;

			if (view.config.columns)
				view.attachEvent("onScrollY", function () {
					proxy._loadNext(this);
				});
			else
				view.attachEvent("onAfterScroll", function () {
					proxy._loadNext(this);
				});

			//attach handlers once
			this._attachHandlers = function () { };
		},
		_loadNext: function (view) {
			var contentScroll = view.getScrollState().y + view.$view.clientHeight;
			var node = view.getItemNode(view.getLastId());
			var height = view.config.rowHeight || view.type.height;

			if (node && contentScroll >= node.offsetTop + height && !this._dontLoadNext) {
				view.loadNext(view.config.datafetch, view.count() + 1);
			}
		}
	};

	function createMarkerButton(btn_color) {
		return {
			view: "button",
			css: "webix_transparent custom_color_btn",
			template: "<div class='video_marker' style='background:" + btn_color + " !important; '></div>",
			width: 30,
			click: function () { if (m_clip != null && m_clip.mmob_id != null) newMarker(btn_color); }
		};
	}


	//webix.protoUI({
	//	name: "vplayer",
	//	defaults: {
	//		template: "qid-player-container",
	//	},
	//	//content: "qid-player-container",
	//	$setSize: function (x, y) {
	//		webix.ui.template.prototype.$setSize.call(this, x, y);
	//		webix.message("resized");
	//	}
	//}, webix.ui.template);

	var pageBrowser = {
		id: "id-page-browser",
		cols: [{
			rows: [{
				view: "toolbar",
				borderless: true,
				id: "assets_tb",
				height: 40,
				cols: [
					{
						view: "button",
						type: "icon",
						css: "webix_transparent",
						icon: "mdi mdi-reload",
						width: 32,
						click: function () {
							refreshAssetTable();
							//$$("id_assets").clearAll();
							//$$("id_assets").load("idata->" + url);
						},
					},
					{
						view: "multiselect",
						id: "id_workspaces",
						label: "Workspace",
						labelAlign: "right",
						width: 250,
						options: "/api/mi/ws/active",

						//		{
						//	body: {
						//				dataFeed: function (text) {
						//			var wks = [];
						//			wks.push({ id: "1", value: "zz" });
						//			wks.push({ id: "2", value: "zz" });
						//			console.log(wks);
						//			this.parse(wks); //webix.ajax("https://api.myjson.com/bins/s96ud"));
						//		}
						//	}
						//},


						//function () {
						//	var wks = [];
						//	wks.push({ id: "1", value: "zz" });
						//	wks.push({ id: "2", value: "zz" });
						//	console.log(wks);
						//	return wks;

						//	webix.ajax().headers({})
						//		.get("/api/mi/ws/get", callback, view).then(function (data) {

						//			var wks = [{ id: "aa" }, { id: "bb" }];
						//			return wks;

						//			var js = data.json();
						//			var new_js = [];

						//			for (key in js) {
						//				new_js.push({
						//					id: key,
						//					name: js[key].name
						//				});
						//			};

						//			return new_js;
						//		});
						//},


						//function() {
						//	var wks = [{ id: "aa" }, { id: "bb" }];
						//	return wks;
						//	//"/api/mi/ws/get"
						//},
						borderless: true,
						on: {
							onChange(newVal, oldVal) {
								//var l = this.getValue();
								//console.log("value:", l);
								refreshAssetTable();
								//$$("id_assets").clearAll();
								//$$("id_assets").load("idata->" + url);
							}
						}
					},
					{
						view: "text",
						id: "id-assets-text",
						label: "Search",
						labelAlign: "right",
						on: {
							onChange(newVal, oldVal) {
								refreshAssetTable();
								//$$("id_assets").clearAll();
								//$$("id_assets").load("idata->" + url);
							}
						}
					}
				]
			}, {
				view: "datatable",
				id: "id_assets",
				drag: true,
				dragColumn: true,
				columns: [
					{
						id: "type",
						header: "",
						width: 32,
						view: "icon",
						template: "<span class='mdi mdi-filmstrip'></span>",
						css: { "font-size": "14pt" },
					}, {
						id: "mmob_name",
						header: "Name",
						fillspace: true,
						minWidth: 200,
						sort: "server",
					}, {
						id: "thumbnails",
						header: "",
						template: "<img src='/portal/thumbnails/#mmob_id#.jpg' style='height:30px'>"
					}, {
						id: "smob_name",
						header: "Tape",
						sort: "server",
					}, {
						id: "tracks",
						header: "Tracks"
					}, {
						id: "video",
						header: "Video",
						width: 250,
						sort: "server",

					}, {
						id: "start",
						header: "Start",
						template: function (obj) {
							var t = Timecode(
								obj.start.startFrame,
								obj.start.fps,
								obj.start.drop);

							return t.toString();

						}
					}, {
						id: "workspace",
						header: "Workspace",
						sort: "server",
					}, {
						id: "duration",
						header: "Duration",
						sort: "server",
						template: function (obj) {
							var t = Timecode(
								obj.duration,
								obj.start.fps,
								obj.start.drop);

							return t.toString();
						}
					}, {
						id: "creation_date",
						sort: "server",
						header: "Created",
						minWidth: 180,
						template: function (obj) {
							var d = new Date(Number(obj.creation_date) * 1000);
							return d.toISOString();
						}
					},
				],
				resizeColumn: { headerOnly: true },
				headerRowHeight: 30,
				rowHeight: 30,
				scroll: "xy",
				datafetch: 100,
				select: "row",
				url: "idata->/portal/db/assets",
				on: {
					onBeforeDrag: function (context, event) {
						const item = context.from.getItem(context.start);
						const dt = new DataTransfer();
						context.dataTransfer = dt;
						context.dataTransfer.setData("DownloadURL", "application/octet-stream:test.aaf:/portal/aaf/test.aaf");
						//console.log("drag start");
					},
					onItemDblClick(id, e, node) {
						var clip = this.getItem(id);
						fillMetadataPage(clip);
						playerOpen(clip);
						refreshMarkerTable();
					},
					onAfterContextMenu: function (id, e, node) {
						webix.delay(function () {
							this.select(id.row);
						}, this);
					},
					onresize: function(){
						aspectVideo();
					},
				},
				//dragStart: function (instance, event) {
				//	console.log('CodeMirror: dragStart');
				//	e.dataTransfer.setData("DownloadURL", ":test.aaf:/portal/aaf/test.aaf");

				//},
				ready() {


					//webix.DragControl.addDrag(this, {
					//	$dragCreate: function (source, ev) {
					//		ev.dataTransfer.setData("DownloadURL", "application/octet-stream:test.aaf:/portal/aaf/test.aaf");
					//		//console.log(ev.dataTransfer.getData("DownloadURL"));
					//		//var dnd = webix.DragControl.getContext();
					//		// setting the source item title as an input value
					//		//target.value = dnd.from.getItem(dnd.source[0]).title;
					//	}
					//});

					//this.attachEvent("onBeforeDrag", function (context, ev) {
					//	ev.dataTransfer.setData("DownloadURL", ":test.aaf:/portal/aaf/test.aaf");
					//	// some code here
					//});
					webix.ui({
						view: "contextmenu", id: "cmAsset",
						data: [
							{ id: "transcode", value: "Transcode..." },
							{ id: "delete", value: "Delete" }
						],
						on: {
							onItemClick: function (id) {

								var context = this.getContext();
								var list = context.obj;
								var listId = context.id;
								var clip = list.getItem(listId);

								if (id == "transcode") { transcode(clip); }
								if (id == "delete") {
									webix.confirm("Are you sure you want to delete selected asset?", "confirm-warning", function (result) {
										if (result) {
											webix.ajax().post("/api/asset/delete", JSON.stringify({ mmob_id: clip.mmob_id })).then(function (result) {
												refreshAssetTable();
											});
										}
									});
								}
							},
						}
					}).attachTo(this);
				}
			}]
		},
		{ view: "resizer", borderless: true },
		{
			rows: [
				//{
				//	view: "vplayer",
				//	borderless: true,
				//},
				{
					view: "template",
					id: "id-player-template",
					css: "video-part",
					borderless: true,
					content: "qid-player-container",
					on: {
						onViewResize: function(){
							aspectVideo();
						}
					}
					//autoheight: true,
				},
				{ view: "resizer", borderless: true },
				{
					view: "tabview",
					borderless: true,
					cells: [
						{
							header: "Metadata",
							body: {
								borderless: true,
								view: "datatable",
								header: false,
								id: "id-meta-form",
								//autowidth: true,
								columns: [
									{ id: "m_name" },
									{ id: "m_value", css: { "color": "white !important" }, fillspace: true },
								],
							}
						},
						{
							header: "Markers",
							width: 150,
							body: {
								rows: [{
									view: "toolbar",
									borderless: true,
									id: "markers_tb",
									height: 40,
									cols: [

										{
											view: "button",
											type: "icon",
											css: "webix_transparent",
											icon: "mdi mdi-reload",
											width: 32,
											click: function () {
												refreshMarkerTable();
											},
										},
										{
											view: "text",
											id: "markers_search_text",
											label: "Search",
											width: 300,
											labelAlign: "right",
											on: {
												onChange(newVal, oldVal) {
													refreshMarkerTable();
												}
											}

										},
										createMarkerButton("red"),
										createMarkerButton("green"),
										createMarkerButton("blue"),
										createMarkerButton("cyan"),
										createMarkerButton("magenta"),
										createMarkerButton("yellow"),
										createMarkerButton("black"),
										createMarkerButton("white"),
										{},
									]
								}, {
									view: "datatable",
									id: "table_markers",
									borderless: true,
									editable: true,
									editaction: "dblclick",
									columns: [
										{
											id: "in",
											header: "In",
											sort: "int",
											//
											minWidth: 90,
											template: function (obj) {
												var t = Timecode(
													m_clip.start.startFrame + obj.in,
													m_clip.start.fps,
													m_clip.start.drop);

												return t.toString();

											}
										},
										{
											id: "out",
											header: "Out",
											sort: "int",
											//
											minWidth: 90,
											template: function (obj) {
												if (obj.out != null) {
													var t = Timecode(
														m_clip.start.startFrame + obj.out,
														m_clip.start.fps,
														m_clip.start.drop);

													return t.toString();
												}
												return "";
											}
										},
										{
											id: "headframe",
											header: "Thumbnail",
											template: "<img src='/portal/markers/#id#.jpg' style='height:30px'>"
										}, {
											id: "comment",
											header: "Comment",
											fillspace: true,
											editor: "text",
										}, {
											id: "color",
											header: "Color",
											sort: "string",
											template: "<div class='video_marker' style='background: #color# !important;'></div>",
										}, {
											id: "created_by",
											header: "User",
											sort: "string",
										}
									],
									resizeColumn: { headerOnly: true },
									headerRowHeight: 30,
									rowHeight: 30,
									scroll: "xy",
									select: "row",
									//url: "idata->" + url,
									ready() {
										aspectVideo();
										//console.log("aspect video");
										webix.ui({
											view: "contextmenu",
											id: "menu_colors",

											template: "<div class='video_marker' style='background: #value# !important;'></div>#value#",
											data: [
												{ id: "set_marker_red", value: "Red" },
												{ id: "set_marker_green", value: "Green" },
												{ id: "set_marker_blue", value: "Blue" },
												{ id: "set_marker_cyan", value: "Cyan" },
												{ id: "set_marker_magenta", value: "Magenta" },
												{ id: "set_marker_yellow", value: "Yellow" },
												{ id: "set_marker_black", value: "Black" },
												{ id: "set_marker_white", value: "White" },
											]
										});

										webix.ui({
											view: "contextmenu", id: "cmMarkers",
											submenuConfig: {

											},
											data: [
												{
													id: "change_color",
													value: "Change Color",
													submenu: "menu_colors",
												},
												{ id: "delete_marker", value: "Delete Marker" }
											],
											on: {
												onMenuItemClick: function (menu_id) {

													var context = this.getContext();
													var list = context.obj;
													var listId = context.id;

													var marker = list.getItem(listId);

													var id = this.getMenuItem(menu_id).id;

													if (id == "delete_marker") {
														webix.confirm("Are you sure you want to delete selected marker?", "confirm-warning", function (result) {
															if (result) {
																webix.ajax().post("/api/markers/del", JSON.stringify({ id: marker.id })).then(function (result) {
																	refreshMarkerTable();
																});
															}
														});
													}

													if (id == "set_marker_red") { updateMarkerColor(marker, "red"); }
													if (id == "set_marker_green") { updateMarkerColor(marker, "green"); }
													if (id == "set_marker_blue") { updateMarkerColor(marker, "blue"); }
													if (id == "set_marker_cyan") { updateMarkerColor(marker, "cyan"); }
													if (id == "set_marker_magenta") { updateMarkerColor(marker, "magenta"); }
													if (id == "set_marker_yellow") { updateMarkerColor(marker, "yellow"); }
													if (id == "set_marker_black") { updateMarkerColor(marker, "black"); }
													if (id == "set_marker_white") { updateMarkerColor(marker, "white"); }
												},
											}
										}).attachTo(this);
									},
									on: {
										onAfterLoad: function () {
											this.sort("#in#", "asc", "int");
											//this.sort("in", "asc");
											//this.markSorting("#in#", "asc");
										},
										onItemDblClick(id, e, node) {
											if (id.column != "color" && id.column != "comment") {
												var item = this.getItem(id);
												playerSeek(item.in);
											}
										},
										onAfterContextMenu: function (id, e, node) {
											webix.delay(function () {
												this.select(id.row);
											}, this);
										},
										onAfterEditStop: function (state, editor, ignoreUpdate) {
											if (state.value != state.old) {
												var item = this.getItem(editor.row);
												webix.ajax().post("/api/markers/update", JSON.stringify(item));
											}
										}
									}
								}]
							}
						},
						//{
						//	header: "Audio",
						//	width: 150,
						//	body: {}
						//},
					],
				},
			],

		},
		]
	};

	var pageJobs = {
		id: "id-page-jobs",
		rows: [{
			view: "toolbar",
			borderless: true,
			height: 40,
			cols: [
				{
					view: "button",
					type: "icon",
					css: "webix_transparent",
					icon: "mdi mdi-reload",
					width: 32,
					click: function () {
						$$("id_jobs").clearAll();
						$$("id_jobs").load("/portal/db/transcoder");
					},
				},
				{
					view: "button",
					type: "icon",
					css: "webix_transparent",
					icon: "mdi mdi-trash-can-outline",
					width: 32,
					click: function () {
						webix.confirm("Are you sure you want to clear completed Jobs?", "confirm-warning", function (result) {
							if (result) {
								webix.ajax().post("/api/transcoder/clear").then(function (result) {
									$$("id_jobs").clearAll();
									$$("id_jobs").load("/portal/db/transcoder");
								});
							}
						});
					},
				},
			]
		}, {
			view: "datatable",
			id: "id_jobs",
			borderless: true,
			url: "/portal/db/transcoder",
			resizeColumn: { headerOnly: true },
			headerRowHeight: 30,
			rowHeight: 30,
			scroll: "xy",
			select: "row",
			columns: [
				{
					id: "name",
					header: "Name",
					fillspace: true,
				},
				{
					id: "message",
					header: "Message",
					minWidth: 300,
				},
				{
					id: "creation_date",
					header: "Created",
					minWidth: 180,
					template: function (obj) {
						var d = new Date(Number(obj.creation_date) * 1000);
						return d.toISOString();
					}
				},
				{
					id: "progress",
					header: "Progress",
					minWidth: 150,
					template: function (obj) {
						//var html = "<p>" + obj.progress + "%</p>";
						html = "<div class='progress_bar_element'>";
						html += "<div title='" + obj.progress + "%" + "' class='progress_result ' style='width:" + (obj.progress + "%") + "'></div>";
						html += "</div>";
						return html;
					}
				},
				{
					id: "action",
					header: "Action",

					template: function (obj) {
						return "<div class='webix_el_button'><span class='mdi mdi-close'></span></div>";
					}
				},
				{
					id: "state",
					header: "State",
				},
			],

		}
		]
	};

	var app_toolbar = {
		view: "toolbar",
		borderless: true,
		css: "app_toolbar",
		height: 50,
		elements: [
			{
				view: "button",
				type: "icon",
				css: "webix_transparent_header",
				width: 50,
				icon: "mdi mdi-menu",
				popup: "app_menu",
			},
			{ view: "label", label: "MediaDirector", css: "app_logo" },
			{},
		]
	};

	//webix.ready(function () {
	webix.ui({
		rows: [
			app_toolbar,
			{
				view: "multiview",
				id: "id_multiview",
				animate: false,
				borderless: true,
				cells: [pageBrowser, pageJobs],
			},
		]
	});
	//});

	webix.ui.fullScreen();

	playerStartup();

	//$$("id_assets").$drag = function (from, e) {
	//	//console.log("hello");
	//	e.dataTransfer.setData("DownloadURL", "application/octet-stream:test.aaf:/portal/aaf/test.aaf");
	//	//return d;
	//}

	//webix.DragControl.addDrag("id_assets", {
	//	$dragCreate: function (f, event) {
	//		var dnd = webix.DragControl.getContext();
	//		event.dataTransfer.setData("DownloadURL", "application/octet-stream:test.aaf:/portal/aaf/test.aaf");
	//		// setting the source item title as an input value
	//		//target.value = dnd.from.getItem(dnd.source[0]).title;
	//	}
	//});
	//playerOpen(test_clip);

	

});

function aspectVideo() {
	var screenWidth= document.getElementById("qid-monitor-container").offsetWidth;
	var screenHeight = document.getElementById("qid-monitor-container").offsetHeight;
	var ratio = 16/9;
	if (screenWidth / ratio > screenHeight) {
		videoWidth = screenHeight * ratio;
		videoHeight = screenHeight;
	}
	else {
		videoHeight = screenWidth / ratio;
		videoWidth = screenWidth;
	}
	//console.log(videoWidth, videoHeight);

	document.getElementById("qid-monitor").style.width =  videoWidth + "px";
	document.getElementById("qid-monitor").style.height =  videoHeight + "px";
}

window.onresize = aspectVideo;
