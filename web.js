// Website build: connects the game to Firebase (anonymous sign-in + Firestore).
// It provides the same small `claude.use("db")` / `claude.use("user")` interface the game
// uses on Claude, so the game code is identical in both places.
(function () {
  var CONFIG = window.DR_FIREBASE;
  var NAME_KEY = 'dailyred:v1:name';
  var names = {};            // uid -> display name, read from the shared players list
  var myName = '';
  try { myName = localStorage.getItem(NAME_KEY) || ''; } catch (e) { /* storage blocked */ }

  if (!CONFIG || !window.firebase) { window.DR_WEB = stubWeb(); return; }
  firebase.initializeApp(CONFIG);
  var auth = firebase.auth();
  var fs = firebase.firestore();

  // Resolves with the signed-in user (anonymous unless linked to Google).
  var ready = new Promise(function (resolve) {
    var done = false;
    auth.onAuthStateChanged(function (u) {
      if (u) { if (!done) { done = true; resolve(u); } return; }
      auth.signInAnonymously().catch(function () { if (!done) { done = true; resolve(null); } });
    });
    setTimeout(function () { if (!done) { done = true; resolve(auth.currentUser); } }, 12000);
  });

  // Paths the game uses -> Firestore paths
  function mapDoc(p) {
    var s = p.split('/');
    if (s[0] === 'data' && s[1] === 'users') return 'users/' + s[2] + '/docs/' + s.slice(3).join('/');
    return p;
  }
  function mapCol(p) {
    var s = p.split('/');
    if (s[0] === 'data' && s[1] === 'users' && s.length === 3) return 'users/' + s[2] + '/docs';
    return p;
  }
  function snapDocs(qs) {
    var docs = qs.docs.map(function (d) {
      var data = d.data();
      if (d.ref.parent.id === 'players' && data && typeof data.name === 'string') names[d.id] = data.name;
      return {id: d.id, exists: true, data: function () { return data; }};
    });
    return {docs: docs, size: docs.length, empty: !docs.length, docChanges: function () { return []; }, metadata: {}};
  }
  function err(e) {
    var code = e && e.code === 'permission-denied' ? 'invalid_argument' : e && e.code === 'unavailable' ? 'unavailable' : 'unavailable';
    return {code: code, message: String(e && e.message || e)};
  }
  function docRef(path) {
    var ref = fs.doc(mapDoc(path));
    var isPlayer = /^players\/[^/]+$/.test(path);
    return {
      id: ref.id, path: path,
      get: function () { return ref.get().then(function (d) { var data = d.data(); return {id: d.id, exists: d.exists, data: function () { return data; }, metadata: {}}; }, function (e) { throw err(e); }); },
      set: function (body) {
        var b = Object.assign({}, body);
        if (isPlayer) b.name = (myName || '').slice(0, 24);
        return ref.set(b).catch(function (e) { throw err(e); });
      },
      update: function (body) { return ref.update(body).catch(function (e) { throw err(e); }); },
      delete: function () { return ref.delete().catch(function (e) { throw err(e); }); },
      onSnapshot: function (next, onErr) { return ref.onSnapshot(function (d) { var data = d.data(); next({id: d.id, exists: d.exists, data: function () { return data; }, metadata: {}}); }, function (e) { onErr && onErr(err(e)); }); }
    };
  }
  function query(q) {
    return {
      limit: function (n) { return query(q.limit(n)); },
      orderBy: function (f, d) { return query(q.orderBy(f, d)); },
      where: function (f, op, v) { return query(q.where(f, op, v)); },
      get: function () { return q.get().then(snapDocs, function (e) { throw err(e); }); },
      onSnapshot: function (next, onErr) { return q.onSnapshot(function (qs) { next(snapDocs(qs)); }, function (e) { onErr && onErr(err(e)); }); }
    };
  }
  var db = {
    doc: docRef,
    collection: function (p) { var c = fs.collection(mapCol(p)); var q = query(c); q.path = p; q.doc = function (id) { return docRef(p + '/' + id); }; return q; }
  };
  var COLORS = ['#c8332f', '#3a6ad6', '#2f9e55', '#d98a1c', '#8a4fc2', '#1f9aa8', '#c2457a', '#5b6b2f'];
  function colorFor(id) { var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return COLORS[h % COLORS.length]; }
  var user = {
    id: function () { return ready.then(function (u) { return u ? u.uid : null; }); },
    profiles: function (ids) {
      var out = {};
      [].concat(ids).forEach(function (id) { out[id] = {id: id, name: names[id] || '', avatarUrl: '', color: colorFor(id), email: null, isMe: !!(auth.currentUser && auth.currentUser.uid === id), guest: false}; });
      return Promise.resolve(out);
    },
    isOwner: function () { return Promise.resolve(false); },
    canEdit: function () { return Promise.resolve(false); },
    can: function () { return Promise.resolve(null); }
  };
  window.claude = {use: function (name) {
    return ready.then(function (u) { if (!u) return null; return name === 'db' ? db : name === 'user' ? user : null; });
  }};

  // Pick up a name saved from another device when this browser has none
  ready.then(function (u) {
    if (!u || myName) return;
    return fs.doc('players/' + u.uid).get().then(function (d) {
      var n = d.exists && d.data().name;
      if (n) { myName = n; try { localStorage.setItem(NAME_KEY, n); } catch (e) { /* ignore */ } }
    }).catch(function () {});
  });

  window.DR_WEB = {
    myName: function () { return myName; },
    setName: function (n) {
      myName = String(n).trim().slice(0, 24);
      try { localStorage.setItem(NAME_KEY, myName); } catch (e) { /* ignore */ }
      return ready.then(function (u) {
        if (!u) return;
        names[u.uid] = myName;
        return fs.doc('players/' + u.uid).set({name: myName}, {merge: true}).catch(function () {});
      });
    },
    canLink: function () { return true; },
    isLinked: function () { var u = auth.currentUser; return !!(u && u.providerData.some(function (p) { return p.providerId === 'google.com'; })); },
    // Returns true when the page should reload because a different (existing) account is now active.
    linkGoogle: function () {
      var provider = new firebase.auth.GoogleAuthProvider();
      var u = auth.currentUser;
      if (!u) return Promise.resolve(false);
      return u.linkWithPopup(provider).then(function () { return false; }, function (e) {
        if (e && e.code === 'auth/credential-already-in-use' && e.credential) {
          return auth.signInWithCredential(e.credential).then(function () { return true; });
        }
        if (e && e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
          alert('Google sign-in did not work: ' + (e.message || e.code));
        }
        return false;
      });
    }
  };

  function stubWeb() {
    return {myName: function () { return myName; }, setName: function (n) { myName = n; try { localStorage.setItem(NAME_KEY, n); } catch (e) {} return Promise.resolve(); },
      canLink: function () { return false; }, isLinked: function () { return false; }, linkGoogle: function () { return Promise.resolve(false); }};
  }
})();
