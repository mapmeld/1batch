/* @flow */
/*global $, comments*/

$(function() {
  for (var c = 0; c < comments.length; c++) {
    var buildComment = comments[c];

    /*
    <p class="comment">title-text</p>
    */

    var comment = $('<p>').addClass('comment').text(buildComment.title);
    $('.comments').append(comment);
  }
});
