var app = getApp()

Page({
  data: {
    drawerVisible: false,
    userInfo: null,
    showRegister: false,
    avatarUrl: '',
    nickName: '',
    submitting: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    navTotalHeight: 64
  },

  onLoad: function () {
    this.setData(app.getNavBarLayout())
  },

  onShow: function () {
    var userInfo = app.getUserInfo()
    this.setData({ userInfo: userInfo })

    // 未登录且未显示注册表单时，自动弹窗
    if (!userInfo && !this.data.showRegister) {
      var that = this
      setTimeout(function () {
        that.setData({ showRegister: true })
      }, 400)
    }
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
    if (path === '/pages/account/account') return
    wx.redirectTo({ url: path })
  },

  // ========== 登录注册 ==========

  showLoginPopup: function () {
    this.setData({ showRegister: true })
  },

  closeRegister: function () {
    this.setData({ showRegister: false })
  },

  onChooseAvatar: function (e) {
    console.log('[account] chooseAvatar:', e.detail.avatarUrl)
    this.setData({ avatarUrl: e.detail.avatarUrl })
  },

  onNicknameInput: function (e) {
    this.setData({ nickName: e.detail.value })
  },

  handleRegister: function () {
    var that = this
    var nickName = this.data.nickName
    var avatarUrl = this.data.avatarUrl

    if (!nickName || !nickName.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }

    this.setData({ submitting: true })

    // 获取 OpenID
    wx.cloud.callFunction({
      name: 'getOpenId',
      success: function (res) {
        console.log('[account] getOpenId 返回:', res.result)
        if (!res.result || !res.result.openId) {
          wx.showToast({ title: '获取身份信息失败', icon: 'none' })
          that.setData({ submitting: false })
          return
        }

        var openId = res.result.openId

        // 创建或更新用户（存到云数据库 users 集合）
        var db = wx.cloud.database()
        db.collection('users').where({ openId: openId }).get({
          success: function (queryRes) {
            var userInfo = {
              openId: openId,
              nickName: nickName.trim(),
              avatarUrl: avatarUrl || ''
            }

            if (queryRes.data.length > 0) {
              // 已有记录，更新
              var userId = queryRes.data[0]._id
              db.collection('users').doc(userId).update({
                data: {
                  nickName: nickName.trim(),
                  avatarUrl: avatarUrl || '',
                  updatedAt: new Date()
                },
                success: function () {
                  userInfo._id = userId
                  app.setUserInfo(userInfo)
                  that.setData({
                    userInfo: userInfo,
                    showRegister: false,
                    submitting: false,
                    avatarUrl: '',
                    nickName: ''
                  })
                  wx.showToast({ title: '登录成功', icon: 'success' })
                },
                fail: function (err) {
                  console.error('[account] 更新用户失败:', err)
                  wx.showToast({ title: '登录失败', icon: 'none' })
                  that.setData({ submitting: false })
                }
              })
            } else {
              // 新用户，创建
              db.collection('users').add({
                data: {
                  openId: openId,
                  nickName: nickName.trim(),
                  avatarUrl: avatarUrl || '',
                  createdAt: new Date()
                },
                success: function (addRes) {
                  userInfo._id = addRes._id
                  app.setUserInfo(userInfo)
                  that.setData({
                    userInfo: userInfo,
                    showRegister: false,
                    submitting: false,
                    avatarUrl: '',
                    nickName: ''
                  })
                  wx.showToast({ title: '登录成功', icon: 'success' })
                },
                fail: function (err) {
                  console.error('[account] 创建用户失败:', err)
                  wx.showToast({ title: '登录失败', icon: 'none' })
                  that.setData({ submitting: false })
                }
              })
            }
          },
          fail: function (err) {
            console.error('[account] 查询用户失败:', err)
            wx.showToast({ title: '登录失败', icon: 'none' })
            that.setData({ submitting: false })
          }
        })
      },
      fail: function (err) {
        console.error('[account] getOpenId 失败:', err)
        wx.showToast({ title: '获取身份信息失败', icon: 'none' })
        that.setData({ submitting: false })
      }
    })
  },

  handleLogout: function () {
    var that = this
    wx.showModal({
      title: '退出登录',
      content: '退出后不会删除您的数据。确定退出吗？',
      confirmColor: '#fb7185',
      success: function (res) {
        if (res.confirm) {
          app.setUserInfo(null)
          that.setData({
            userInfo: null,
            showRegister: false,
            avatarUrl: '',
            nickName: ''
          })
          wx.showToast({ title: '已退出登录', icon: 'none' })
        }
      }
    })
  }
})
