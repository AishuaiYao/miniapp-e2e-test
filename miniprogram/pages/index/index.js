var app = getApp()

Page({
  data: {
    messages: [
      { role: 'assistant', content: '你好，按住下方按钮说话，我来帮你回答' }
    ],
    recording: false,
    loading: false,
    recordDuration: 0,
    recordStatusText: '正在录音...',
    loadingText: '正在识别语音...',
    scrollToId: ''
  },

  // 录音管理器
  recorderManager: null,
  // 录音计时器
  durationTimer: null,
  // 录音开始时间
  recordStartTime: 0,

  onLoad: function () {
    // 获取全局唯一的录音管理器
    this.recorderManager = wx.getRecorderManager()

    // 监听录音开始
    this.recorderManager.onStart(function () {
      console.log('[录音] 开始录音')
    })

    // 监听录音结束
    var that = this
    this.recorderManager.onStop(function (res) {
      console.log('[录音] 结束录音, duration:', res.duration, 'ms, fileSize:', res.fileSize, 'bytes')
      console.log('[录音] 录音文件路径:', res.tempFilePath)
      that.handleRecordEnd(res)
    })

    // 监听录音错误
    this.recorderManager.onError(function (err) {
      console.error('[录音] 录音错误:', err)
      that.setData({
        recording: false,
        loading: false
      })
      wx.showToast({ title: '录音失败: ' + (err.errMsg || ''), icon: 'none' })
    })
  },

  // ========== 录音相关 ==========

  onRecordStart: function () {
    if (this.data.loading || this.data.recording) {
      console.log('[录音] 跳过：正在处理中或已录音中')
      return
    }

    console.log('[录音] onRecordStart')

    // 检查录音权限
    var that = this
    wx.getSetting({
      success: function (res) {
        if (res.authSetting['scope.record']) {
          // 已授权，开始录音
          that.startRecording()
        } else {
          // 未授权，请求授权
          wx.authorize({
            scope: 'scope.record',
            success: function () {
              console.log('[录音] 授权成功')
              that.startRecording()
            },
            fail: function () {
              console.error('[录音] 授权失败')
              wx.showModal({
                title: '提示',
                content: '需要录音权限才能使用语音功能，请在设置中开启',
                confirmText: '去设置',
                success: function (res) {
                  if (res.confirm) {
                    wx.openSetting()
                  }
                }
              })
            }
          })
        }
      }
    })
  },

  startRecording: function () {
    console.log('[录音] 开始录音...')
    this.setData({
      recording: true,
      recordDuration: 0,
      recordStatusText: '正在录音...'
    })
    this.recordStartTime = Date.now()

    // 开始计时
    var that = this
    this.durationTimer = setInterval(function () {
      var seconds = Math.floor((Date.now() - that.recordStartTime) / 1000)
      that.setData({ recordDuration: seconds })
      console.log('[录音] 已录制', seconds, 's')

      // 最长 60 秒
      if (seconds >= 60) {
        console.log('[录音] 达到60秒上限，自动停止')
        that.recorderManager.stop()
      }
    }, 1000)

    // 开始录音
    this.recorderManager.start({
      duration: 60000,       // 最长 60 秒
      sampleRate: 16000,     // 16K 采样率
      numberOfChannels: 1,   // 单声道
      encodeBitRate: 48000,  // 编码码率
      format: 'mp3'          // mp3 格式
    })
  },

  onRecordEnd: function () {
    if (!this.data.recording) {
      return
    }
    console.log('[录音] onRecordEnd, 停止录音')
    this.recorderManager.stop()
  },

  // ========== 处理录音结束 ==========

  handleRecordEnd: function (res) {
    // 清除计时器
    if (this.durationTimer) {
      clearInterval(this.durationTimer)
      this.durationTimer = null
    }

    var duration = Math.floor((Date.now() - this.recordStartTime) / 1000)
    console.log('[录音] 实际录制时长:', duration, 's')

    // 录音太短，忽略
    if (duration < 1) {
      console.log('[录音] 录音太短(<1s)，忽略')
      this.setData({ recording: false })
      wx.showToast({ title: '录音太短，请长按说话', icon: 'none' })
      return
    }

    this.setData({
      recording: false,
      loading: true,
      loadingText: '正在识别语音...'
    })

    // 先在 UI 中添加一条 user 消息（占位），记录本地录音文件路径
    var msgs = this.data.messages.concat([
      { role: 'user', content: '识别中...', audioPath: '', playing: false },
      { role: 'assistant', content: '' }
    ])
    this.setData({
      messages: msgs,
      scrollToId: 'msg-' + (msgs.length - 1)
    })

    var that = this
    var userIndex = msgs.length - 2
    var assistantIndex = msgs.length - 1
    var localAudioPath = res.tempFilePath

    // 保存本地录音路径到消息中，用于播放
    this.setData({
      ['messages[' + userIndex + '].audioPath']: localAudioPath
    })

    // 读取本地录音文件，转 base64 后直接传给云函数（不经过云存储）
    console.log('[ASR] 读取本地录音文件并转 base64:', localAudioPath)
    var fileManager = wx.getFileSystemManager()
    fileManager.readFile({
      filePath: localAudioPath,
      encoding: 'base64',
      success: function (fileRes) {
        var audioBase64 = fileRes.data
        console.log('[ASR] base64 读取成功, 长度:', audioBase64.length)
        that.callASR(audioBase64, userIndex, assistantIndex)
      },
      fail: function (err) {
        console.error('[ASR] 读取本地录音文件失败:', err)
        that.setData({
          ['messages[' + userIndex + '].content']: '读取录音失败',
          loading: false
        })
      }
    })
  },

  // ========== 调用 ASR（本地直接调阿里云） ==========

  callASR: function (audioBase64, userIndex, assistantIndex) {
    console.log('[ASR] 本地直接调用阿里云 ASR, base64 长度:', audioBase64.length)

    var apiKey = app.getAliyunApiKey()
    if (!apiKey) {
      console.error('[ASR] API Key 未加载')
      this.setData({
        ['messages[' + userIndex + '].content']: '配置加载失败',
        ['messages[' + assistantIndex + '].content']: 'API Key 未就绪，请稍后重试',
        loading: false
      })
      return
    }

    var audioData = 'data:audio/mpeg;base64,' + audioBase64
    var that = this

    wx.request({
      url: 'https://llm-mhwgg01ku321wyjx.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'X-DashScope-SSE': 'disable'
      },
      data: {
        model: 'qwen-audio-3.0-asr-flash',
        input: {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_audio',
                  input_audio: {
                    data: audioData
                  }
                }
              ]
            }
          ]
        },
        parameters: {
          format: 'mp3',
          sample_rate: '16000'
        }
      },
      success: function (res) {
        console.log('[ASR] 响应 statusCode:', res.statusCode)
        console.log('[ASR] 响应体:', res.data)

        if (res.statusCode === 200 && res.data) {
          // DashScope 响应: output.choices[0].message.content
          var choices = res.data.output && res.data.output.choices
          if (choices && choices[0]) {
            var message = choices[0].message
            var text = ''
            if (Array.isArray(message.content)) {
              text = message.content.map(function (item) { return item.text || '' }).join('')
            } else if (typeof message.content === 'string') {
              text = message.content
            }

            if (text) {
              console.log('[ASR] 识别成功, 文本:', text)
              that.setData({
                ['messages[' + userIndex + '].content']: text,
                loadingText: 'AI 正在思考...'
              })
              that.callHY3(text, assistantIndex)
              return
            }
          }
        }

        // 识别失败
        var errMsg = (res.data && res.data.error && res.data.error.message) || '未知错误'
        console.error('[ASR] 识别失败:', errMsg)
        that.setData({
          ['messages[' + userIndex + '].content']: '识别失败',
          ['messages[' + assistantIndex + '].content']: '语音识别失败：' + errMsg,
          loading: false
        })
      },
      fail: function (err) {
        console.error('[ASR] 请求失败:', err)
        that.setData({
          ['messages[' + userIndex + '].content']: '识别失败',
          ['messages[' + assistantIndex + '].content']: '网络请求失败：' + (err.errMsg || ''),
          loading: false
        })
      }
    })
  },

  // ========== 调用 HY3 大模型 ==========

  callHY3: function (text, assistantIndex) {
    console.log('[HY3] 开始调用大模型, 输入:', text)

    var that = this
    var answer = ''
    var chunkCount = 0
    var startTime = Date.now()

    try {
      var model = wx.cloud.extend.AI.createModel('cloudbase')

      var requestData = {
        model: 'hy3-preview',
        messages: [
          {
            role: 'system',
            content: '你是简洁的AI助手，每次回答不超过50个字。'
          },
          { role: 'user', content: text }
        ]
      }
      console.log('[HY3] 请求数据:', JSON.stringify(requestData))

      // 超时检测
      var timeoutFlag = true
      var timeoutTimer = setTimeout(function () {
        if (timeoutFlag) {
          console.error('[HY3] 超时: 20秒无响应')
          that.setData({
            ['messages[' + assistantIndex + '].content']: 'AI 回复超时',
            loading: false
          })
        }
      }, 20000)

      ;(async function () {
        try {
          console.log('[HY3] await streamText...')
          var res = await model.streamText({ data: requestData })
          console.log('[HY3] 返回, 耗时:', Date.now() - startTime, 'ms')

          timeoutFlag = false
          clearTimeout(timeoutTimer)

          console.log('[HY3] 开始遍历 textStream...')
          for await (var chunk of res.textStream) {
            chunkCount++
            console.log('[HY3] chunk #' + chunkCount + ':', JSON.stringify(chunk))
            answer += chunk
            that.setData({
              ['messages[' + assistantIndex + '].content']: answer,
              scrollToId: 'msg-' + assistantIndex
            })
          }
          console.log('[HY3] 完成, 共', chunkCount, '个chunk, 回答:', answer)
          console.log('[HY3] 总耗时:', Date.now() - startTime, 'ms')
          that.setData({ loading: false })
        } catch (err) {
          timeoutFlag = false
          clearTimeout(timeoutTimer)
          console.error('[HY3] 错误:', err)
          that.setData({
            ['messages[' + assistantIndex + '].content']: 'AI 回复出错：' + (err.message || '未知错误'),
            loading: false
          })
        }
      })()
    } catch (e) {
      console.error('[HY3] 同步异常:', e)
      this.setData({
        ['messages[' + assistantIndex + '].content']: 'AI 调用异常：' + (e.message || ''),
        loading: false
      })
    }
  },

  // ========== 语音播放 ==========

  // 音频播放管理器
  audioContext: null,
  // 当前正在播放的消息索引
  playingIndex: -1,

  onPlayAudio: function (e) {
    var index = e.currentTarget.dataset.index
    var msg = this.data.messages[index]
    if (!msg || !msg.audioPath) {
      console.warn('[播放] 没有可播放的音频, index:', index)
      return
    }

    console.log('[播放] 点击播放, index:', index, ', 本地路径:', msg.audioPath)

    // 如果当前正在播放这条，则停止
    if (this.playingIndex === index) {
      console.log('[播放] 当前正在播放，停止播放')
      this.stopAudio()
      return
    }

    // 先停止之前的播放
    if (this.playingIndex >= 0) {
      this.stopAudio()
    }

    // 创建音频上下文（每次新建确保干净）
    var that = this
    this.audioContext = wx.createInnerAudioContext()
    this.audioContext.src = msg.audioPath
    this.playingIndex = index

    // 标记当前消息为播放中
    this.setData({
      ['messages[' + index + '].playing']: true
    })

    this.audioContext.onPlay(function () {
      console.log('[播放] 开始播放')
    })

    this.audioContext.onEnded(function () {
      console.log('[播放] 播放结束')
      that.resetPlayState()
    })

    this.audioContext.onError(function (err) {
      console.error('[播放] 播放错误:', err)
      that.resetPlayState()
      wx.showToast({ title: '播放失败', icon: 'none' })
    })

    this.audioContext.onStop(function () {
      console.log('[播放] 停止播放')
    })

    this.audioContext.play()
  },

  stopAudio: function () {
    if (this.audioContext) {
      this.audioContext.stop()
      this.audioContext.destroy()
      this.audioContext = null
    }
    this.resetPlayState()
  },

  resetPlayState: function () {
    if (this.playingIndex >= 0) {
      this.setData({
        ['messages[' + this.playingIndex + '].playing']: false
      })
      this.playingIndex = -1
    }
  }
})
