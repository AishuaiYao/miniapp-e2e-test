var app = getApp()

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    navTotalHeight: 64
  },

  onLoad: function () {
    this.setData(app.getNavBarLayout())
  }
})
