const track = document.querySelector('.strip-track');
const duplicate = track.firstElementChild.cloneNode(true);
duplicate.setAttribute('aria-hidden', 'true');
track.append(duplicate);
track.classList.add('playable');
