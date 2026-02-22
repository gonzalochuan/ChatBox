let seq = 0;

module.exports = {
  assignUser: function assignUser(userContext, _events, done) {
    seq += 1;
    const userId = `loadtest-${Date.now()}-${process.pid}-${seq}`;
    userContext.vars.userId = userId;
    return done();
  },
};
