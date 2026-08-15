var app = getApp()

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    navTotalHeight: 64,
    drawerVisible: false,
    notebooks: [],
    currentNotebookId: '',
    // 创建弹窗
    showTypeSelect: false,
    showCreate: false,
    newName: '',
    newDesc: '',
    customIcon: '',
    creating: false,

    // 预设账本类型
    presetTypes: [
      { name: '日常开销', icon: '/images/日常开销.png', desc: '日常生活支出' },
      { name: '旅行账本', icon: '/images/旅行.png', desc: '旅途花销记录' },
      { name: '育儿账本', icon: '/images/育儿.png', desc: '孩子相关支出' },
      { name: '学习账本', icon: '/images/学习.png', desc: '学习培训费用' },
      { name: '装修账本', icon: '/images/装修.png', desc: '房屋装修支出' },
      { name: '婚礼账本', icon: '/images/结婚.png', desc: '结婚相关花销' },
      { name: '医疗健康', icon: '/images/医疗.png', desc: '看病保健支出' },
      { name: '聚餐账本', icon: '/images/团建聚餐.png', desc: '请客聚餐花销' }
    ]
  },

  onLoad: function () {
    this.setData(app.getNavBarLayout())
  },

  onShow: function () {
    this.loadNotebooks()
  },

  // ========== 导航抽屉 ==========

  openDrawer: function () {
    this.setData({ drawerVisible: true })
  },

  closeDrawer: function () {
    this.setData({ drawerVisible: false })
  },

  onNavigate: function (e) {
    var path = e.detail.path
    if (path === '/pages/notebooks/notebooks') return
    wx.redirectTo({ url: path })
  },

  // ========== 账本数据 ==========

  loadNotebooks: function () {
    var that = this
    wx.getStorage({
      key: 'notebooks',
      success: function (res) {
        var notebooks = res.data || []
        // 格式化时间
        for (var i = 0; i < notebooks.length; i++) {
          if (notebooks[i].createdAt) {
            notebooks[i].timeStr = that.formatTime(new Date(notebooks[i].createdAt))
          }
        }
        var currentNotebookId = app.getCurrentNotebookId()
        that.setData({
          notebooks: notebooks,
          currentNotebookId: currentNotebookId
        })
      }
    })
  },

  saveNotebooks: function () {
    wx.setStorage({
      key: 'notebooks',
      data: this.data.notebooks
    })
  },

  // ========== 创建账本 ==========

  showCreatePopup: function () {
    this.setData({ showTypeSelect: true })
  },

  closeTypeSelect: function () {
    this.setData({ showTypeSelect: false })
  },

  onSelectType: function (e) {
    var name = e.currentTarget.dataset.name
    var icon = e.currentTarget.dataset.icon
    var desc = e.currentTarget.dataset.desc

    this.setData({
      showTypeSelect: false,
      newName: name,
      newDesc: desc
    })

    this.createNotebook(name, desc, icon)
  },

  showCustomInput: function () {
    this.setData({
      showTypeSelect: false,
      showCreate: true,
      newName: '',
      newDesc: '',
      customIcon: ''
    })
  },

  closeCreate: function () {
    this.setData({ showCreate: false, customIcon: '' })
  },

  onChooseIcon: function () {
    var that = this
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        var tempPath = res.tempFiles[0].tempFilePath
        that.setData({ customIcon: tempPath })
      }
    })
  },

  onRemoveIcon: function () {
    this.setData({ customIcon: '' })
  },

  onNameInput: function (e) {
    this.setData({ newName: e.detail.value })
  },

  onDescInput: function (e) {
    this.setData({ newDesc: e.detail.value })
  },

  handleCreate: function () {
    var name = this.data.newName.trim()
    if (!name) {
      wx.showToast({ title: '请输入账本名称', icon: 'none' })
      return
    }

    this.setData({ creating: true })
    this.createNotebook(name, this.data.newDesc.trim(), this.data.customIcon)
    this.setData({ creating: false, showCreate: false, customIcon: '' })
  },

  createNotebook: function (name, desc, icon) {
    var notebook = {
      _id: 'nb_' + Date.now(),
      name: name,
      description: desc,
      customIcon: icon || '',
      createdAt: Date.now(),
      timeStr: this.formatTime(new Date())
    }

    var notebooks = this.data.notebooks.concat([notebook])
    this.setData({ notebooks: notebooks })
    this.saveNotebooks()

    if (this.data.notebooks.length === 1 || !app.getCurrentNotebookId()) {
      app.setCurrentNotebook(notebook._id, notebook.name)
      this.setData({ currentNotebookId: notebook._id })
    }

    wx.showToast({ title: '创建成功', icon: 'success' })
  },

  // ========== 选择账本 ==========

  selectNotebook: function (e) {
    var id = e.currentTarget.dataset.id
    var name = e.currentTarget.dataset.name

    app.setCurrentNotebook(id, name)
    this.setData({ currentNotebookId: id })

    wx.showToast({ title: '已切换到「' + name + '」', icon: 'none' })
  },

  // ========== 删除账本 ==========

  onDeleteNotebook: function (e) {
    var id = e.currentTarget.dataset.id
    var name = e.currentTarget.dataset.name
    var that = this

    wx.showModal({
      title: '删除账本',
      content: '删除「' + name + '」后，该账本下的记账记录也会被删除，确定删除吗？',
      confirmColor: '#fb7185',
      success: function (res) {
        if (res.confirm) {
          var notebooks = that.data.notebooks.filter(function (n) { return n._id !== id })
          that.setData({ notebooks: notebooks })
          that.saveNotebooks()

          // 如果删除的是当前账本
          if (that.data.currentNotebookId === id) {
            if (notebooks.length > 0) {
              app.setCurrentNotebook(notebooks[0]._id, notebooks[0].name)
              that.setData({ currentNotebookId: notebooks[0]._id })
            } else {
              app.setCurrentNotebook('', '')
              that.setData({ currentNotebookId: '' })
            }
          }

          // 删除该账本下的记账记录
          that.deleteRecordsByNotebook(id)

          wx.showToast({ title: '已删除', icon: 'none' })
        }
      }
    })
  },

  deleteRecordsByNotebook: function (notebookId) {
    var that = this
    wx.getStorage({
      key: 'account_records',
      success: function (res) {
        var records = res.data || []
        var filtered = records.filter(function (r) { return r.notebookId !== notebookId })
        wx.setStorage({
          key: 'account_records',
          data: filtered
        })
      }
    })
  },

  formatTime: function (date) {
    var y = date.getFullYear()
    var m = (date.getMonth() + 1).toString().padStart(2, '0')
    var d = date.getDate().toString().padStart(2, '0')
    var h = date.getHours().toString().padStart(2, '0')
    var min = date.getMinutes().toString().padStart(2, '0')
    return y + '-' + m + '-' + d + ' ' + h + ':' + min
  }
})
