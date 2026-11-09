// The demo menu and the always-visible label. Scenarios are scripted samples, never real activity.
(function () {
  const tag = document.createElement('div');
  tag.id = 'map3d-tag';
  tag.textContent = 'DEMO: NO LIVE DATA';
  document.body.append(tag);
  if (!window.StationDemo) return;

  const menu = document.createElement('select');
  menu.id = 'map3d-demo';
  menu.setAttribute('aria-label', 'Watch a demo scenario');
  menu.append(new Option('Watch a demo scenario', ''));
  [['traffic', 'Traffic Control'], ['content', 'Content Engine']].forEach(([room, label]) => {
    const group = document.createElement('optgroup');
    group.label = label;
    StationDemo.list(room).forEach(item => group.append(new Option(item.title, item.id)));
    menu.append(group);
  });
  menu.addEventListener('change', () => {
    const id = menu.value;
    menu.value = '';
    if (id) StationDemo.play(id);
  });
  document.body.append(menu);
})();
