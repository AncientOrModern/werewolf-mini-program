Page({
  data: {
    lastConfig: null
  },

  onShow() {
    this.setData({ lastConfig: wx.getStorageSync('lastConfig') || null })
  },

  startGame() {
    wx.navigateTo({ url: '/pages/setup/setup' })
  },

  openRules() {
    wx.navigateTo({ url: '/pages/rules/rules' })
  }
})
