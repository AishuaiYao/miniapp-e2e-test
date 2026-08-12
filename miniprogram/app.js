App({
  globalData: {
    aliyunApiKey: null
  },

  onLaunch: function () {
    wx.cloud.init({
      env: 'cloud1-d7g1myj7ab00b5661'
    })

    // 通过云函数获取阿里云 API Key（云函数有管理员权限，能正常下载 config.json）
    this.loadAliyunApiKey()
  },

  loadAliyunApiKey: function () {
    var that = this
    console.log('[app] 调用云函数 getConfig 获取 API Key')

    wx.cloud.callFunction({
      name: 'getConfig',
      success: function (res) {
        console.log('[app] getConfig 返回:', JSON.stringify(res.result))
        if (res.result && res.result.success) {
          that.globalData.aliyunApiKey = res.result.apiKey
          console.log('[app] aliyun_api_key 已加载, 长度:', that.globalData.aliyunApiKey.length)
        } else {
          console.error('[app] 获取 API Key 失败:', res.result)
        }
      },
      fail: function (err) {
        console.error('[app] 调用 getConfig 失败:', err)
      }
    })
  },

  getAliyunApiKey: function () {
    return this.globalData.aliyunApiKey
  }
})
