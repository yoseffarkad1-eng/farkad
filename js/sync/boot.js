// ---------------------------------------------------------------- the sync bootstrap
//
// The last file of the sync group, and it is a file rather than the tail of another one
// for a reason worth keeping: the two lines below RUN at load time, and everything they
// reach has to be defined before they do. While all of this lived in one file that was
// simply true. Split across several, it becomes a thing somebody has to remember - and
// the failure if they forget is that a phone opens with a queue it has not read, reports
// nothing waiting, and looks perfectly healthy.
//
// So the bootstrap is on its own, loaded last, and every later split of the sync group
// goes in ABOVE it. That is the whole job of this file: to be last.

// `const` at the top level of a classic script creates a global BINDING, not a property
// of window - so every other classic file here can say FarkadSync, and the Firebase
// adapter, which is the one ES module in the app, cannot: window.FarkadSync was
// undefined and the very first line it ran threw. Sync could never have connected.
// Published deliberately, and by the name the module expects.
window.FarkadSync = FarkadSync;

// Read back immediately, not at connect: pendingCount() has to be truthful on a device
// that has never had a cloud, and the answer lives on disk.
FarkadSync.loadOutbox();
