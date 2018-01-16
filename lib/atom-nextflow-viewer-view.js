'use babel'

/* global atom */

import {CompositeDisposable} from 'atom'
import {ScrollView} from 'atom-space-pen-views'
import path from 'path'
import fs from 'fs'
import svgPanZoom from 'svg-pan-zoom/src/svg-pan-zoom'
import {nativeImage} from 'electron'
import clipboard from 'clipboard'

import childProcess from 'child_process'

export default
class AtomNextflowViewerView extends ScrollView {
  constructor (editorId) {
    super()
    this.editorId = editorId
    this.disposables = new CompositeDisposable()
  }

  getDetectedPathFor (execName) {
    for (var pathsDir of process.env.PATH.split(path.delimiter)) {
      var candidateExecPath = path.join(pathsDir, execName)
      if (fs.existsSync(candidateExecPath)) {
        return candidateExecPath
      }
    }
  }

  queueUpdate () {
    if (this.updateImageTimerId) return
    this.updateImageTimerId = setTimeout(() => {
      this.updateImage()
      this.updateImageTimerId = undefined
    }, 20)
  }

  attached () {
    if (atom.workspace) this.resolve()
    else {
      const disp = atom.packages.onDidActivateInitialPackages(this.resolve)
      this.disposables.add(disp)
    }
  }

  serialize () {
    return {
      deserializer: 'AtomNextflowViewerView',
      editorId: this.editorId
    }
  }

  destroy () {
    this.disposables.dispose()
    if (this.panZoom) this.panZoom.destroy()
    this.panZoom = undefined

    clearInterval(this.interval)
  }

  resolve () {
    this.editor = this.getEditorForId(this.editorId)

    if (this.editor) {
      this.handleEvents()
      this.queueUpdate()
    }
  }

  getEditorForId (editorId) {
    for (const editor of atom.workspace.getTextEditors()) {
      if (editor.id.toString() === editorId.toString()) return editor
    }
  }

  handleEvents () {
    atom.commands.add(this.element, 'core:save-as', (event) => {
      event.stopPropagation()
      this.saveAs()
    })
    atom.commands.add(this.element, 'core:save', (event) => {
      event.stopPropagation()
      this.saveAs()
    })
    atom.commands.add(this.element, 'core:copy', (event) => {
      event.stopPropagation()
      this.copy()
    })

    if (atom.config.get('atom-nextflow-viewer.liveUpdate')) {
      this.disposables.add(this.editor.getBuffer().onDidChange(() => {
        if (this.loading) {
          this.waitingToLoad = true
          return
        }
        this.queueUpdate()
      }))

      this.interval = setInterval(() => {
        if (this.panZoom) {
          if (this.width !== super.width() || this.height !== super.height()) {
            this.queueUpdate()
            this.width = super.width()
            this.height = super.height()
          }
        }
      }, 500)
    }

    atom.workspace.onDidChangeActivePaneItem(() => {
      // The DOM and visibility is not yet updated
      var wasVisible = super.is(':visible')
      if (wasVisible) return
      // wait until update is complete
      setTimeout(() => {
        this.updatePanZoom()
      }, 0)
    })

    this.on('click', () => {
      atom.workspace.paneForURI(this.editor.getURI()).activate()
    })
  }

  updatePanZoom () {
    if (!super.is(':visible')) return

    var svgElement = this.find('svg')[0]
    if (!svgElement) return

    var newPanZoom = svgPanZoom(svgElement)

    newPanZoom.center()
    var oldCenter = this.centerpan
    this.centerpan = newPanZoom.getPan()

    if (this.panZoom) {
      var oldPanZoom = this.panZoom

      var oldZoom = oldPanZoom.getZoom()
      oldPanZoom.resetZoom()
      var x = oldPanZoom.getPan().x - oldCenter.x
      var y = oldPanZoom.getPan().y - oldCenter.y

      newPanZoom.panBy({ x: x, y: y })
      newPanZoom.zoom(oldZoom)

      oldPanZoom.destroy()
      oldPanZoom = undefined
    }

    this.panZoom = newPanZoom
  }

  updateImage () {
    this.loading = true

    var nextflow = atom.config.get('atom-nextflow-viewer.nextflowExecutable') || this.getDetectedPathFor('nextflow')
    var dot = atom.config.get('atom-nextflow-viewer.graphvizDotExecutable') || this.getDetectedPathFor('dot')
    var dotfile = "/tmp/" + Math.random().toString(36).slice(-8) + ".dot"
    var nextflowProcess    = childProcess.spawn(nextflow + ' run ' + this.editor.getPath() + " -with-dag " + dotfile + ' ; ' + dot + " " + dotfile+ ' -Tsvg', [], {shell: true})

    var chunks = []
    nextflowProcess.stdout.on('data', (chunk) => chunks.push(chunk))
    nextflowProcess.stdout.on('end', () => {
      var data = Buffer.concat(chunks)
      super.html(data.toString())

      this.updatePanZoom()

      if (this.waitingToLoad) {
        this.waitingToLoad = false
        this.queueUpdate()
      }
      this.loading = false
    })
  }

  saveAs () {
    var filters = [
      { name: 'Encapsulated PostScript (.eps)', extensions: ['eps'] },
      { name: 'Scalable Vector Graphics (.svg)', extensions: ['svg'] },
      { name: 'Portable Network Graphics (.png)', extensions: ['png'] }
    ]
    var filePath = this.editor.getPath().replace(/\.[^/.]+$/, '')
    var options = { defaultPath: filePath, filters: filters }
    var savePath = atom.showSaveDialogSync(options)

    if (savePath) {
      var extension = savePath.substr(savePath.lastIndexOf('.') + 1)
      var fileStream = fs.createWriteStream(savePath)

      var nextflow = atom.config.get('atom-nextflow-viewer.nextflowExecutable') || this.getDetectedPathFor('nextflow')
      var dot = atom.config.get('atom-nextflow-viewer.graphvizDotExecutable') || this.getDetectedPathFor('dot')
      var nextflowProcess    = childProcess.spawn(nextflow + ' --print-dot ' + this.editor.getPath() + ' | ' + dot + ' -T'+extension, [], {shell: true})
      nextflowProcess.stdout.pipe(fileStream)
    }
  }

  copy () {
    var options = {
      format: 'png',
      include: path.dirname(this.editor.getPath()),
      dot: atom.config.get('atom-nextflow-viewer.graphvizDotExecutable') || this.getDetectedPathFor('dot'),
      config: atom.config.get('atom-nextflow-viewer.configFile'),
      charset: atom.config.get('atom-nextflow-viewer.charset')
    }

    var nextflow = atom.config.get('atom-nextflow-viewer.nextflowExecutable') || this.getDetectedPathFor('nextflow')
    var dot = atom.config.get('atom-nextflow-viewer.graphvizDotExecutable') || this.getDetectedPathFor('dot')
    var dotfile = "/tmp/" + Math.random().toString(36).slice(-8) + ".dot"
    var nextflowProcess    = childProcess.spawn(nextflow + ' run ' + this.editor.getPath() + " -with-dag " + dotfile + ' | ' + dot + " " + dotfile+ ' -Tpng', [], {shell: true})
    var chunks = []
    nextflowProcess.stdout.on('data', (chunk) => chunks.push(chunk))
    nextflowProcess.stdout.on('end', () => {
      var buffer = Buffer.concat(chunks)
      var image = nativeImage.createFromBuffer(buffer)
      clipboard.writeImage(image)
    })


  }

  getTitle () {
    if (this.editor) return `${this.editor.getTitle()} View`
    return 'Atom Nextflow View'
  }

  getURI () {
    return `atom-nextflow-viewer://editor/${this.editorId}`
  }

  getPath () {
    if (this.editor) return this.editor.getPath()
  }

  isEqual (other) {
    // Compare DOM elements
    if (other) return this[0] === other[0]
  }

  static content () {
    AtomNextflowViewerView.div({
      class: 'atom-nextflow-viewer native-key-bindings',
      tabindex: -1
    })
  }
}
