'use babel'

/* global atom */

import {CompositeDisposable} from 'atom'
import url from 'url'
import config from './config.json'

export {activate, deactivate, config}

const ATOM_NEXTFLOW_VIEWER_URI_PROTOCOL = 'atom-nextflow-viewer:'
let AtomNextflowViewerView
let disposables

function createAtomNextflowViewerView (editorId) {
  if (!AtomNextflowViewerView) {
    AtomNextflowViewerView = require('./atom-nextflow-viewer-view')
  }
  return new AtomNextflowViewerView(editorId)
}

atom.deserializers.add({
  name: 'AtomNextflowViewerView',
  deserialize: (state) => createAtomNextflowViewerView(state.editorId)
})

function activate (state) {
  disposables = new CompositeDisposable()
  disposables.add(atom.commands.add('atom-workspace', {
    'atom-nextflow-viewer:toggle': toggle
  }))

  disposables.add(atom.workspace.addOpener(AtomNextflowViewerOpener))
}

function deactivate () {
  disposables.dispose()
}

function toggle () {
  if (isAtomNextflowViewerView(atom.workspace.getActivePaneItem())) {
    atom.workspace.destroyActivePaneItem()
    return
  }

  const editor = atom.workspace.getActiveTextEditor()
  if (!editor) return

  const grammars = atom.config.get('atom-nextflow-viewer.grammars') || []
  if (grammars.indexOf(editor.getGrammar().scopeName) === -1) return

  const uri = createAtomNextflowViewerUri(editor)
  const viewer = atom.workspace.paneForURI(uri)

  if (!viewer) addViewerForUri(uri)
  else viewer.destroyItem(viewer.itemForURI(uri))
}

function addViewerForUri (uri) {
  const prevActivePane = atom.workspace.getActivePane()
  const options = { searchAllPanes: true }

  if (atom.config.get('atom-nextflow-viewer.openInSplitPane')) {
    options.split = 'right'
  }

  atom.workspace.open(uri, options).then((view) => prevActivePane.activate())
}

function createAtomNextflowViewerUri (editor) {
  return ATOM_NEXTFLOW_VIEWER_URI_PROTOCOL + '//editor/' + editor.id
}

function AtomNextflowViewerOpener (uri) {
  let parsedUri

  try {
    parsedUri = url.parse(uri)
  } catch (err) { return }

  if (parsedUri.protocol !== ATOM_NEXTFLOW_VIEWER_URI_PROTOCOL) return

  const editorId = parsedUri.pathname.substring(1)
  return createAtomNextflowViewerView(editorId)
}

function isAtomNextflowViewerView (object) {
  if (!AtomNextflowViewerView) {
    AtomNextflowViewerView = require('./atom-nextflow-viewer-view')
  }
  return object instanceof AtomNextflowViewerView
}
