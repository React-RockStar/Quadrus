var test_clip = {
	mmob_name: "Test clip",
	//mmob_id: "060a2b340101010501010f1013-000000-a8f7099f509105a5-0d4498e7f48b-9963",
	mmob_id: "060a2b340101010101010f0013-000000-42000000fefa4bbd-060e2b347f7f-2a80",
	rate: {
		num: 25,
		den: 1,
	},

	start: {
		fps: 25,
		startFrame: Number(90000),
		drop: false,
	},

	duration: 14208,
};

const qp_player_container = document.getElementById('qid-player-container')
const qp_video = document.getElementById('qid-monitor');
const qp_timecode = document.getElementById('qid-player-tc');
const qp_name = document.getElementById('qid-player-name');
const qp_slider = document.getElementById('qid-player-slider');
const qp_refresh = document.getElementById('qid-player-refresh');
const qp_play = document.getElementById('qid-player-play');
const qp_canvas = document.getElementById('qid-player-canvas');

var m_clip = null;
var m_player = null;

class QsPlayer {

	startOffset = 0;
	source = null;
	buffer = null;
	queue = [];
	flag_eof = false;
	eventTimerID = 0;
	ws = null;
	ready = false;
	xhr = null;

	//==========================================================
	// 
	//==========================================================

	constructor(frame) {

		this.startOffset = frame;

		this.xhr = new XMLHttpRequest();
		this.xhr.addEventListener("load", this.onLoad.bind(this));

		this.source = new MediaSource();
		qp_video.src = window.URL.createObjectURL(this.source);
		this.source.addEventListener("sourceopen", this.onSourceOpen.bind(this));
	}

	//==========================================================
	// 
	//==========================================================

	onUpdateEnd() {
		this.redrawCacheCanvas();
	}

	//==========================================================
	// 
	//==========================================================

	onSourceOpen() {
		// 42C01E - Constrained Baseline 3.0
		this.buffer = this.source.addSourceBuffer('video/mp4; codecs="avc1.42C01E, mp4a.40.02, mp4a.40.02"');

		this.buffer.mode = 'sequence';

		this.buffer.addEventListener('updateend', this.onUpdateEnd.bind(this));

		this.async_server_open();

		this.startEventHander();
	}

	//==========================================================
	// 
	//==========================================================

	onLoad() {

		this.read_flag = false;
		this.ready = true;

		if (this.xhr.status == 200) {

			var arrayBuffer = this.xhr.response;

			if (arrayBuffer) {
				var byteArray = new Uint8Array(arrayBuffer);
				this.queue.push(byteArray);
			}

			this.appendToBuffer();
			this.processStream();
			//this.server_next_async();
		} else {
			this.flag_eof = true;
			this.endOfStream();
			console.log('onLoad: EOF');
		}
	};

	//==========================================================
	// request first chunk
	//==========================================================

	async_server_open() {

		if (this.flag_eof || this.read_flag) return;

		this.read_flag = true;

		this.xhr.open("POST", "/player/open");
		this.xhr.responseType = "arraybuffer";
		this.xhr.send(JSON.stringify({ mmob_id: m_clip.mmob_id, start_offset: this.startOffset }));
	}

	//==========================================================
	// request next chunk
	//==========================================================

	server_next_async() {

		if (this.flag_eof || this.read_flag) return;

		// we keep in buffer ~2min
		if (this.bufferedTime() > 120) return;

		this.read_flag = true;

		this.xhr.open("GET", "/player/next");
		this.xhr.responseType = "arraybuffer";
		this.xhr.send(); //JSON.stringify({ user: "admin" }));
	}

	//==========================================================
	// return video frame time (mid of frame)
	//==========================================================

	frameToTime(frames) {

		var frame_length_half = m_clip.rate.den / m_clip.rate.num / 2;

		return (m_clip.rate.den * frames / m_clip.rate.num + frame_length_half);
	}

	//==========================================================
	// Return current video frame
	//==========================================================

	timeToFrame(time) {
		var ctf = time.toFixed(5);
		var frames = Math.floor(ctf * m_clip.rate.num / m_clip.rate.den);
		return frames;
	}

	//==========================================================
	// return: 0..m_clip.duration
	//==========================================================

	currentFrame() {
		if (qp_video.currentTime >= 0) {
			var frame = this.startOffset + this.timeToFrame(qp_video.currentTime);
			return Number(frame);
		}
		return Number(0);
	}

	//==========================================================
	// return: buffered time 
	//==========================================================

	bufferedTime() {

		if (!this.ready) return 0;

		var len = 0;

		for (let i = 0; i < this.buffer.buffered.length; i++) {
			var start = this.buffer.buffered.start(i);
			var end = this.buffer.buffered.end(i);
			len += (end - start);
		}

		return len;
	}

	//==========================================================
	// append chunks to the buffer
	//==========================================================

	appendToBuffer() {

		// buffer is busy? exit
		if (!this.ready || this.buffer.updating) return;

		while (this.queue.length > 0 && !this.buffer.updating) {
			var item = this.queue.shift();
			this.buffer.appendBuffer(item);
			//console.log("appendBuffer", item.byteLength);
		}
	}

	//==========================================================
	// 
	//==========================================================

	endOfStream() {
		if (this.queue.length == 0 && this.flag_eof && !this.buffer.updating) {
			if (this.source.readyState !== 'ended') {
				this.source.endOfStream();
			}
		}
	}

	//==========================================================
	// 
	//==========================================================

	processStream() {

		if (qp_video.currentTime > 60 && !this.buffer.updating) {
			this.buffer.remove(0, qp_video.currentTime - 60);
		}

		this.server_next_async();

		this.endOfStream();
	}

	//==========================================================
	// timer callback
	//==========================================================

	eventHandler() {

		if (!playerIsPlaying() || !this.ready) return;

		var frame = this.currentFrame();
		qp_slider.value = frame;
		updateTC(frame, true);

		this.processStream();
	}

	//==========================================================
	// start timer
	//==========================================================

	startEventHander() {
		this.stopEventHandler();
		this.eventTimerID = setInterval(this.eventHandler.bind(this), 1000);
		console.log("setInterval", this.eventTimerID);
	}

	//==========================================================
	// stop timer
	//==========================================================

	stopEventHandler() {

		console.log("clearInterval", this.eventTimerID);
		if (this.eventTimerID) {
			clearInterval(this.eventTimerID);
			this.eventTimerID = 0;
		}
	}

	//==========================================================
	// 
	//==========================================================

	redrawCacheCanvas() {

		var context = qp_canvas.getContext("2d");

		context.clearRect(0, 0, qp_canvas.width, qp_canvas.height);

		// Get frame width
		var fw = qp_canvas.width / Number(m_clip.duration - 1);

		if (this.ready) {
			//this.buffer &&
			//this.buffer.buffered &&
			//this.buffer.buffered.length) {
			for (let i = 0; i < this.buffer.buffered.length; i++) {
				var start = this.startOffset + this.timeToFrame(this.buffer.buffered.start(i));
				var end = this.startOffset + this.timeToFrame(this.buffer.buffered.end(i));
				var x = fw * start;
				var w = fw * (end - start);
				context.fillStyle = "#9698a5";
				context.fillRect(x, 0, w, qp_canvas.height);
				//console.log(qp_canvas.width, w, start, end, m_clip.duration);
			}
		} else {
			console.log("UI error");
		}
	}

	//==========================================================
	// check if frame in cache
	//==========================================================

	checkCache(position) {

		if (!this.ready) return false;

		var frame = clipFramePosition(position);

		var cache_time = this.frameToTime(frame - this.startOffset);

		for (let i = 0; i < this.buffer.buffered.length; i++) {

			var start = this.buffer.buffered.start(i);
			var end = this.buffer.buffered.end(i);

			if (cache_time >= start && cache_time < end) {
				return true;
			}
		}
		return false;
	}

	//==========================================================
	// frame: 0..m_clip.duration
	//==========================================================

	fastSeek(position) {

		if (!this.ready) return false;

		var frame = clipFramePosition(position);

		if (this.checkCache(frame)) {

			qp_video.currentTime = this.frameToTime(frame - this.startOffset);

			//console.log("fastSeek: OK", frame);

			return true;
		}

		console.log("fastSeek: not possible", frame);
		return false;
	}
};

//==========================================================
// 
//==========================================================

function updateTC(position, trim_tc = false) {
	var frame = clipFramePosition(position);

	var f = Number(m_clip.start.startFrame) + frame;

	var t = Timecode(f, m_clip.start.fps, m_clip.start.drop);
	var s = t.toString();
	if (trim_tc) {
		s = s.substr(0, 9) + "--";
	}
	qp_timecode.innerHTML = s;
}
//==========================================================
// 
//==========================================================

function clipFramePosition(postion) {

	var frame = Number(postion);

	if (frame < 0)
		frame = 0;

	if (frame >= m_clip.duration)
		frame = (m_clip.duration - 1);

	return frame;
}

//==========================================================
// open clip
//==========================================================

function playerOpen(clip, offset = 0) {

	playerClose();

	m_clip = clip;
	m_player = new QsPlayer(offset);

	qp_slider.min = 0;
	qp_slider.max = Number(clip.duration) - 1;
	qp_slider.value = offset;
	qp_slider.disabled = false;
	playerDisableButtons(false);
	qp_name.innerHTML = clip.mmob_name;
	updateTC(offset);
}

//==========================================================
// seek for:
//
// - keyboard shortcuts
// - external call
//==========================================================

function playerSeek(position) {

	if (!m_player || !m_player.ready) return;

	var frame = clipFramePosition(position);

	playerSeekInternal(frame);

	qp_slider.value = frame;

	updateTC(frame);
}

//==========================================================
// frame : 0..m_clip.duration
//==========================================================

function playerSeekInternal(position) {

	if (m_player == null) return;

	var frame = clipFramePosition(position);

	//console.log("playerSeekInternal: ", frame);

	if (m_player.fastSeek(frame) != true) {

		m_player.ready = false;
		m_player.stopEventHandler();
		m_player.xhr.abort();
		delete m_player;
		m_player = null;
		m_player = new QsPlayer(frame);
	}
}

//==========================================================
// 
//==========================================================

function playerClose() {

	if (m_player != null) {
		m_player.ready = false;
		m_player.stopEventHandler();
		m_player.xhr.abort();
		delete m_player;
		m_player = null;
	}

	qp_timecode.innerHTML = "--:--:--:--";
	qp_name.innerHTML = "";
	qp_slider.min = 0;
	qp_slider.max = 0;
	qp_slider.value = 0;
	qp_slider.disabled = true;
	playerDisableButtons(true);
}

//==========================================================
// is playing ?
//==========================================================

function playerIsPlaying() {
	if (qp_video.paused || qp_video.ended) return false;
	return true;
}

//==========================================================
// play/stop
//==========================================================

function playerTogglePlay() {
	if (playerIsPlaying()) {
		qp_video.pause();
	} else {
		qp_video.play();
		qp_play.style.color = "#2b62ad";
	}
}

//==========================================================
// seek after pause - MSE bug
//==========================================================

qp_video.onpause = function () {
	var pos = qp_video.currentTime;
	qp_video.currentTime = pos;

	var frame = m_player.currentFrame();
	qp_slider.value = frame;
	updateTC(frame);
	qp_play.style.color = "#b2b5c9";
};

//==========================================================
// 
//==========================================================

qp_video.onended = function (event) {
	console.log("onended!");
	var frame = m_player.currentFrame();
	qp_slider.value = frame;
	updateTC(frame);
	qp_play.style.color = "#b2b5c9";
};

//==========================================================
// keyboard hotkeys
//==========================================================

function playerDisableButtons(status) {

	var elements = document.getElementsByClassName("qs-player-button");
	for (var i = 0; i < elements.length; i++) {
		elements[i].disabled = status;
	}
}

//==========================================================
// 
//==========================================================

function playerPause() {
	if (playerIsPlaying()) {
		qp_video.pause();
	}
}

//==========================================================
// 
//==========================================================

function playerFrameBackward() {
	qp_video.pause();
	playerSeek(Number(qp_slider.value) - 1);
}

//==========================================================
// 
//==========================================================

function playerFrameForward() {
	qp_video.pause();
	playerSeek(Number(qp_slider.value) + 1);
}

//==========================================================
// 
//==========================================================

function playerSeekStart() {
	qp_video.pause();
	playerSeek(0);
}

//==========================================================
// 
//==========================================================

function playerSeekEnd() {
	qp_video.pause();
	playerSeek(Number(m_clip.duration) - 1);
}

//==========================================================
// keyboard hotkeys
//==========================================================

function playerKeyDown(e) {

	var keyCode = e.keyCode;

	if (!m_player || !m_player.ready) return;

	if (keyCode == 37 || keyCode == 51) { // left/3
		playerFrameBackward();
		e.preventDefault();
	}
	else if (keyCode == 32) { // space (play/pause)
		playerTogglePlay();
		e.preventDefault();
	}
	else if (keyCode == 39 || keyCode == 52) { // right/4
		playerFrameForward();
		e.preventDefault();
	}
	else if (keyCode == 35) { // end (will stop playing automatically)
		playerSeekEnd();
		e.preventDefault();
	}
	else if (keyCode == 36) { // home
		playerSeekStart();
		e.preventDefault();
	}
	else if (keyCode == 75) { // K - pause
		qp_video.pause();
		e.preventDefault();
	}
	else if (keyCode == 76) { // L - play
		qp_video.play();
		qp_play.style.color = "#2b62ad";
		e.preventDefault();
	}
}

//==========================================================
// 
//==========================================================

function playerStartup() {

	qp_slider.addEventListener('input', function () {
		qp_video.pause();
		if (m_player) {
			m_player.fastSeek(qp_slider.value);
			updateTC(qp_slider.value);
		}
	}, false);

	qp_slider.addEventListener('mouseup', function () {
		if (m_player) {
			if (!m_player.checkCache(qp_slider.value)) {
				playerSeek(Number(qp_slider.value));
			}
		}
	}, false);

	qp_player_container.addEventListener('keydown', playerKeyDown);

	qp_refresh.addEventListener("click", function () {
		if (m_player) {
			var offset = m_player.currentFrame();
			playerOpen(m_clip, offset);
		}
	}, false);

	qp_play.addEventListener("click", playerTogglePlay, false);

	document.getElementById('qid-player-home').addEventListener("click", playerSeekStart, false);
	document.getElementById('qid-player-frameb').addEventListener("click", playerFrameBackward, false);
	document.getElementById('qid-player-framef').addEventListener("click", playerFrameForward, false);
	document.getElementById('qid-player-end').addEventListener("click", playerSeekEnd, false);

	playerClose();
}

//==========================================================
// 
//==========================================================

//window.onload = function () {

//	playerStartup();

//	playerOpen(test_clip);
//}