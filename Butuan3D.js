/* global L, Cesium */

// Cesiumion Token
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIxZDJmN2M4NC1kZWIxLTQ2ODMtOTJmOC02YTU1OTBmZTVhODYiLCJpZCI6NTI5Miwic2NvcGVzIjpbImFzciIsImdjIl0sImlhdCI6MTU0Mjg4MzU1Mn0._uoY-p9jn7hJRlk5ff0ENoiZzEhDa91l_KcdWsnW58A';

// Creating the Viewer
var viewer = new Cesium.Viewer('cesiumContainer', {
  scene3DOnly: true,
  selectionIndicator: true,
  baseLayerPicker: true
});
// --Adding Terrain
// Load Cesium World Terrain
viewer.terrainProvider = Cesium.createWorldTerrain({
  requestWaterMask : true, // required for water effects
  requestVertexNormals : true // required for terrain lighting
});

// Enable depth testing so things behind the terrain disappear.
viewer.scene.globe.depthTestAgainstTerrain = true;
// --end

// --Configuring the Scene
// Enable lighting based on sun/moon positions
viewer.scene.globe.enableLighting = true;

// Create an initial camera view
var initialPosition = new Cesium.Cartesian3.fromDegrees(125.496, 8.896, 2631.082799425431);
var initialOrientation = new Cesium.HeadingPitchRoll.fromDegrees(35.1077496389876024807, -25.987223091598949054, 0.025883251314954971306);
var homeCameraView = {
  destination : initialPosition,
  orientation : {
    heading : initialOrientation.heading,
    pitch : initialOrientation.pitch,
    roll : initialOrientation.roll
  }
};

// Set the initial view
viewer.scene.camera.setView(homeCameraView);

// Camera flight animation options
homeCameraView.duration = 2.0;
homeCameraView.maximumHeight = 2000;
homeCameraView.pitchAdjustHeight = 2000;
homeCameraView.endTransform = Cesium.Matrix4.IDENTITY;

// Override the default home button
viewer.homeButton.viewModel.command.beforeExecute.addEventListener(function (e) {
e.cancel = true;
viewer.scene.camera.flyTo(homeCameraView);
});

// Set up clock and timeline.
var clock = new Cesium.Clock({
startTime : Cesium.JulianDate.fromIso8601('2018-11-27'),
currentTime : Cesium.JulianDate.fromIso8601('2018-11-27'),
stopTime : Cesium.JulianDate.fromIso8601('2018-11-28'),
clockRange : Cesium.ClockRange.LOOP_STOP, // loop when we hit the end time
clockStep : Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER,
multiplier : 4000, // how much time to advance each tick
shouldAnimate : false // Animation on by default
});
// --end

// --Loading and Styling Entities
var kmlOptions = {
  camera : viewer.scene.camera,
  canvas : viewer.scene.canvas,
  clampToGround : true
};

var geojsonOptions = {
  clampToGround : true
};

// Load neighborhood boundaries from a GeoJson file
var neighborhoodsPromise = Cesium.GeoJsonDataSource.load('https://cdn.glitch.com/a31c0754-01d8-4dc9-a867-cc9867a90332%2FButuan_Brgy.geojson?1543389387537', geojsonOptions);

// Save an new entity collection of neighborhood data
var neighborhoods;
neighborhoodsPromise.then(function(dataSource) {
  // Add the new data as entities to the viewer
  viewer.dataSources.add(dataSource);
  neighborhoods = dataSource.entities;

  // Get the array of entities
  var neighborhoodEntities = dataSource.entities.values;
  for (var i = 0; i < neighborhoodEntities.length; i++) {
    var entity = neighborhoodEntities[i];

    if (Cesium.defined(entity.polygon)) {
    // Use kml neighborhood value as entity name
      entity.name = entity.properties.BARANGAY;
      // Set the polygon material to a random, translucent color
      entity.polygon.material = Cesium.Color.fromRandom({
        red : 0.1,
        maximumGreen : 0.5,
        minimumBlue : 0.5,
        alpha : 0.2
      });

      // Tells the polygon to color the terrain. ClassificationType.CESIUM_3D_TILE will color the 3D tileset, and ClassificationType.BOTH will color both the 3d tiles and terrain (BOTH is the default)
      entity.polygon.classificationType = Cesium.ClassificationType.TERRAIN;
      // Generate Polygon center
      var polyPositions = entity.polygon.hierarchy.getValue(Cesium.JulianDate.now()).positions;
      var polyCenter = Cesium.BoundingSphere.fromPoints(polyPositions).center;
      polyCenter = Cesium.Ellipsoid.WGS84.scaleToGeodeticSurface(polyCenter);
      entity.position = polyCenter;
     /*//Generate labels
      entity.label = {
        text : entity.name,
        showBackground : true,
        scale : 0.6,
        horizontalOrigin : Cesium.HorizontalOrigin.CENTER,
        verticalOrigin : Cesium.VerticalOrigin.BOTTOM,
        distanceDisplayCondition : new Cesium.DistanceDisplayCondition(10.0, 8000.0),
        disableDepthTestDistance : 100.0
      };*/
    }
  }
});
// --end

// --Load 3D Tileset
// Load the Butuan buildings tileset
var city = viewer.scene.primitives.add(new Cesium.Cesium3DTileset({ url: Cesium.IonResource.fromAssetId(11438) }));

// HTML overlay for showing feature name on mouseover
var nameOverlay = document.createElement('div');
viewer.container.appendChild(nameOverlay);
nameOverlay.className = 'backdropOverlay';
nameOverlay.style.display = 'none';
nameOverlay.style.position = 'absolute';
nameOverlay.style.bottom = '0';
nameOverlay.style.left = '0';
nameOverlay.style['pointer-events'] = 'none';
nameOverlay.style.padding = '4px';
nameOverlay.style.backgroundColor = 'black';

// Information about the currently selected feature
var selected = {
  feature: undefined,
  originalColor: new Cesium.Color()
};

// An entity object which will hold info about the currently selected feature for infobox display
var selectedEntity = new Cesium.Entity();

// Get default left click handler for when a feature is not picked on left click
var clickHandler = viewer.screenSpaceEventHandler.getInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);

// If silhouettes are supported, silhouette features in blue on mouse over and silhouette green on mouse click.
// If silhouettes are not supported, change the feature color to yellow on mouse over and green on mouse click.
if (Cesium.PostProcessStageLibrary.isSilhouetteSupported(viewer.scene)) {
  // Silhouettes are supported
  var silhouetteBlue = Cesium.PostProcessStageLibrary.createEdgeDetectionStage();
  silhouetteBlue.uniforms.color = Cesium.Color.BLUE;
  silhouetteBlue.uniforms.length = 0.01;
  silhouetteBlue.selected = [];

  var silhouetteGreen = Cesium.PostProcessStageLibrary.createEdgeDetectionStage();
  silhouetteGreen.uniforms.color = Cesium.Color.LIME;
  silhouetteGreen.uniforms.length = 0.01;
  silhouetteGreen.selected = [];

  viewer.scene.postProcessStages.add(Cesium.PostProcessStageLibrary.createSilhouetteStage([silhouetteBlue, silhouetteGreen]));

  // Silhouette a feature blue on hover.
  viewer.screenSpaceEventHandler.setInputAction(function onMouseMove(movement) {
    // If a feature was previously highlighted, undo the highlight
    silhouetteBlue.selected = [];

    // Pick a new feature
    var pickedFeature = viewer.scene.pick(movement.endPosition);
    if (!Cesium.defined(pickedFeature)) {
      nameOverlay.style.display = 'none';
      return;
    }

    // A feature was picked, so show it's overlay content
    nameOverlay.style.display = 'block';
    nameOverlay.style.bottom = viewer.canvas.clientHeight - movement.endPosition.y + 'px';
    nameOverlay.style.left = movement.endPosition.x + 'px';
    var name = pickedFeature.getProperty('NAME');
    if (!Cesium.defined(name)) {
      name = pickedFeature.getProperty('FID');
    }
    nameOverlay.textContent = name;

    // Highlight the feature if it's not already selected.
      if (pickedFeature !== selected.feature) {
        silhouetteBlue.selected = [pickedFeature];
      }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  // Silhouette a feature on selection and show metadata in the InfoBox.
  viewer.screenSpaceEventHandler.setInputAction(function onLeftClick(movement) {
    // If a feature was previously selected, undo the highlight
    silhouetteGreen.selected = [];

    // Pick a new feature
    var pickedFeature = viewer.scene.pick(movement.position);
    if (!Cesium.defined(pickedFeature)) {
      clickHandler(movement);
      return;
    }

    // Select the feature if it's not already selected
    if (silhouetteGreen.selected[0] === pickedFeature) {
      return;
    }

    // Save the selected feature's original color
    var highlightedFeature = silhouetteBlue.selected[0];
    if (pickedFeature === highlightedFeature) {
      silhouetteBlue.selected = [];
    }

    // Highlight newly selected feature
    silhouetteGreen.selected = [pickedFeature];

    // Set feature infobox description
    var featureName = pickedFeature.getProperty('NAME');
    selectedEntity.name = featureName;
    selectedEntity.description = 'Loading <div class="cesium-infoBox-loading"></div>';
    viewer.selectedEntity = selectedEntity;
    selectedEntity.description = '<table class="cesium-infoBox-defaultTable"><tbody>' +
                                 '<tr><th>Name</th><td>' + pickedFeature.getProperty('NAME') + '</td></tr>' +
                                 '<tr><th>Barangay</th><td>' + pickedFeature.getProperty('BARANGAY') + '</td></tr>' +
                                 '<tr><th>Wind Power Density (watt/sqm)</th><td>' + pickedFeature.getProperty('wpd') + '</td></tr>' +
                                 '<tr><th>Building Height (m)</th><td>' + pickedFeature.getProperty('bxu_minus') + '</td></tr>' +
                                 '<tr><th>Building Area (sqm) </th><td>' + pickedFeature.getProperty('Shape_Area') + '</td></tr>' +
                                 '</tbody></table>';
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
} else {
  // Silhouettes are not supported. Instead, change the feature color.

  // Information about the currently highlighted feature
  var highlighted = {
    feature : undefined,
    originalColor : new Cesium.Color()
  };

  // Color a feature yellow on hover.
  viewer.screenSpaceEventHandler.setInputAction(function onMouseMove(movement) {
    // If a feature was previously highlighted, undo the highlight
    if (Cesium.defined(highlighted.feature)) {
      highlighted.feature.color = highlighted.originalColor;
      highlighted.feature = undefined;
    }
    // Pick a new feature
    var pickedFeature = viewer.scene.pick(movement.endPosition);
    if (!Cesium.defined(pickedFeature)) {
      nameOverlay.style.display = 'none';
      return;
    }
    // A feature was picked, so show it's overlay content
    nameOverlay.style.display = 'block';
    nameOverlay.style.bottom = viewer.canvas.clientHeight - movement.endPosition.y + 'px';
    nameOverlay.style.left = movement.endPosition.x + 'px';
    var name = pickedFeature.getProperty('NAME');
      if (!Cesium.defined(name)) {
        name = pickedFeature.getProperty('FID');
      }
      nameOverlay.textContent = name;
      // Highlight the feature if it's not already selected.
      if (pickedFeature !== selected.feature) {
        highlighted.feature = pickedFeature;
        Cesium.Color.clone(pickedFeature.color, highlighted.originalColor);
        pickedFeature.color = Cesium.Color.YELLOW;
      }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  // Color a feature on selection and show metadata in the InfoBox.
  viewer.screenSpaceEventHandler.setInputAction(function onLeftClick(movement) {
  // If a feature was previously selected, undo the highlight
  if (Cesium.defined(selected.feature)) {
    selected.feature.color = selected.originalColor;
    selected.feature = undefined;
  }
  // Pick a new feature
  var pickedFeature = viewer.scene.pick(movement.position);
  if (!Cesium.defined(pickedFeature)) {
    clickHandler(movement);
    return;
  }
  // Select the feature if it's not already selected
  if (selected.feature === pickedFeature) {
    return;
  }
  selected.feature = pickedFeature;
  // Save the selected feature's original color
  if (pickedFeature === highlighted.feature) {
    Cesium.Color.clone(highlighted.originalColor, selected.originalColor);
    highlighted.feature = undefined;
  } else {
      Cesium.Color.clone(pickedFeature.color, selected.originalColor);
    }
    // Highlight newly selected feature
    pickedFeature.color = Cesium.Color.LIME;
    // Set feature infobox description
    var featureName = pickedFeature.getProperty('NAME');
    selectedEntity.name = featureName;
    selectedEntity.description = 'Loading <div class="cesium-infoBox-loading"></div>';
    viewer.selectedEntity = selectedEntity;
    selectedEntity.description = '<table class="cesium-infoBox-defaultTable"><tbody>' +
                                 '<tr><th>Name</th><td>' + pickedFeature.getProperty('NAME') + '</td></tr>' +
                                 '<tr><th>Barangay</th><td>' + pickedFeature.getProperty('BARANGAY') + '</td></tr>' +
                                 '<tr><th>Wind Power Density (watt/sqm)</th><td>' + pickedFeature.getProperty('wpd') + '</td></tr>' +
                                 '<tr><th>Building Height (m)</th><td>' + pickedFeature.getProperty('bxu_minus') + '</td></tr>' +
                                 '<tr><th>Building Area (sqm) </th><td>' + pickedFeature.getProperty('Shape_Area') + '</td></tr>' +
                                 '</tbody></table>';
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

// Adjust the tileset height to overlay correctly onto base map
var heightOffset = 72;
city.readyPromise.then(function(tileset) {
  // Position tileset
  var boundingSphere = tileset.boundingSphere;
  var cartographic = Cesium.Cartographic.fromCartesian(boundingSphere.center);
  var surfacePosition = Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, 0.0);
  var offsetPosition = Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, heightOffset);
  var translation = Cesium.Cartesian3.subtract(offsetPosition, surfacePosition, new Cesium.Cartesian3());
  tileset.modelMatrix = Cesium.Matrix4.fromTranslation(translation);
});
// --end

// --Style 3D Tileset
// Define a white, opaque building style
var defaultStyle = new Cesium.Cesium3DTileStyle({
  color : "rgb(255, 255, 255)",
  show : true
});

// Set the tileset style to default
city.style = defaultStyle;

// Define a white, transparent building style
var transparentStyle = new Cesium.Cesium3DTileStyle({
  color : "color('white', 0.3)",
  show : true
});

// Define a style in which buildings are colored by height
var heightStyle = new Cesium.Cesium3DTileStyle({
  color : {
    conditions : [
                 ["${bxu_minus} >= 15.1", "rgb(51, 25, 0)"],
                 ["${bxu_minus} >= 10.5", "rgb(153, 76, 0)"],
                 ["${bxu_minus} >= 8.7", "rgb(204, 102, 0)"],
                 ["${bxu_minus} >= 6.9", "rgb(255, 128, 0)"],
                 ["${bxu_minus} >= 5.1", "rgb(255, 178, 102)"],
                 ["${bxu_minus} >= 3.3", "rgb(255, 229, 204)"],
                 ["${bxu_minus} >= 0", "rgb(255, 255, 255)"],
                 ["true", "rgb(127, 59, 8)"]
    ]
  }
});

// Define a style in which buildings are colored by wpd (1/2 of standard deviation)
var wpdStyle = new Cesium.Cesium3DTileStyle({
  color : {
    conditions : [
                 ["${wpd} >= 15.64320535", "rgb(102, 0, 0)"],
                 ["${wpd} >= 15.63822937", "rgb(255, 0, 0)"],
                 ["${wpd} >= 15.63325339", "rgb(204, 0, 102)"],
                 ["${wpd} >= 15.62330143", "rgb(255, 153, 51)"],
                 ["${wpd} >= 15.61334947", "rgb(255, 255, 102)"],
                 ["${wpd} >= 15.5266", "rgb(255, 204, 204)"],
                 ["true", "rgb(255, 33, 23)"]
    ]
  }
 });

// Define a style in which buildings are colored by building area
var areaStyle = new Cesium.Cesium3DTileStyle({
  color : {
    conditions : [
                 ["${Shape_Area} >= 3000", "rgb(0, 0, 0)"],
                 ["${Shape_Area} >= 2000", "rgb(51, 0, 25)"],
                 ["${Shape_Area} >= 1100", "rgb(102, 0, 51)"],
                 ["${Shape_Area} >= 900", "rgb(153, 0, 76)"],
                 ["${Shape_Area} >= 700", "rgb(204, 0, 0)"],
                 ["${Shape_Area} >= 500", "rgb(204, 0, 102)"],
                 ["${Shape_Area} >= 400", "rgb(255, 0, 27)"],
                 ["${Shape_Area} >= 300", "rgb(255, 51, 153)"],
                 ["${Shape_Area} >= 200", "rgb(255, 102, 178)"],
                 ["${Shape_Area} >= 100", "rgb(255, 153, 204)"],
                 ["${Shape_Area} >= 0", "rgb(229, 204, 255)"],
                 ["true", "rgb(255, 255, 255)"]
    ]
  }
});
// --end

// Legends for each style
var heightLegends = "";

// Building Height
heightLegends += "<div class='legend-item'><div class='color-box' style='background-color:rgb(51, 25, 0)'></div><div>Above 15 meters</div></div>";
heightLegends += "<div class='legend-item'><div class='color-box' style='background-color:rgb(153, 76, 0)'></div><div>11 to 15 meters</div></div>";
heightLegends += "<div class='legend-item'><div class='color-box' style='background-color:rgb(204, 102, 0)'></div><div>9 to 11 meters</div></div>";
heightLegends += "<div class='legend-item'><div class='color-box' style='background-color:rgb(255, 128, 0)'></div><div>7 to 9 meters</div></div>";
heightLegends += "<div class='legend-item'><div class='color-box' style='background-color:rgb(255, 178, 102)'></div><div>5 to 7 meters</div></div>";
heightLegends += "<div class='legend-item'><div class='color-box' style='background-color:rgb(255, 229, 204)'></div><div>3 to 5 meters</div></div>";
heightLegends += "<div class='legend-item'><div class='color-box' style='background-color:rgb(255, 255, 255)'></div><div>0 to 3 meters</div></div>";

// WPD
var wpdLegends = "";
wpdLegends += "<div class='legend-item'><div class='color-box' style='background-color:rgb(102, 0, 0)'></div><div>Above 16.6432 W/sqm</div></div>";
wpdLegends += "<div class='legend-item'><div class='color-box' style='background-color:rgb(255, 0, 0)'></div><div>15.6382 to 15.6432 W/sqm</div></div>";
wpdLegends += "<div class='legend-item'><div class='color-box' style='background-color:rgb(204, 0, 102)'></div><div>15.6333 to 15.6382 W/sqm</div></div>";
wpdLegends += "<div class='legend-item'><div class='color-box' style='background-color:rgb(255, 153, 51)'></div><div>15.6233 to 15.6333 W/sqm</div></div>";
wpdLegends += "<div class='legend-item'><div class='color-box' style='background-color:rgb(255, 255, 102)'></div><div>15.6133 to 15.6233 W/sqm</div></div>";
wpdLegends += "<div class='legend-item'><div class='color-box' style='background-color:rgb(255, 204, 204)'></div><div>15.5266 to 15.6133 W/sqm</div></div>";

// Building Area
var areaLegends = "";
areaLegends += "<div class='legend-item'><div class='color-box' style='background-color:rgb(0, 0, 0)'></div><div>Above 3000 sqm</div></div>";
areaLegends += "<div class='legend-item'><div class='color-box' style='background-color:rgb(51, 0, 25)'></div><div>2000 to 3000 sqm</div></div>";
areaLegends += "<div class='legend-item'><div class='color-box' style='background-color:rgb(102, 0, 51)'></div><div>1100 to 2000 sqm</div></div>";
areaLegends += "<div class='legend-item'><div class='color-box' style='background-color:rgb(153, 0, 76)'></div><div>900 to 1100 sqm</div></div>";
areaLegends += "<div class='legend-item'><div class='color-box' style='background-color:rgb(204, 0, 0)'></div><div>700 to 900 sqm</div></div>";
areaLegends += "<div class='legend-item'><div class='color-box' style='background-color:rgb(204, 0, 102)'></div><div>500 to 700 sqm</div></div>";
areaLegends += "<div class='legend-item'><div class='color-box' style='background-color:rgb(255, 0, 27)'></div><div>400 to 500 sqm</div></div>";
areaLegends += "<div class='legend-item'><div class='color-box' style='background-color:rgb(255, 51, 153)'></div><div>300 to 400 sqm</div></div>";
areaLegends += "<div class='legend-item'><div class='color-box' style='background-color:rgb(255, 102, 178)'></div><div>200 to 300 sqm</div></div>";
areaLegends += "<div class='legend-item'><div class='color-box' style='background-color:rgb(255, 153, 204)'></div><div>100 to 200 sqm</div></div>";
areaLegends += "<div class='legend-item'><div class='color-box' style='background-color:rgb(229, 204, 255)'></div><div>0 to 100 sqm</div></div>";
// --end

// 3D Tile styling with corresponding legend
var tileStyle = document.getElementById('tileStyle');
function set3DTileStyle() {
  var selectedStyle = tileStyle.options[tileStyle.selectedIndex].value;

  // Remove all legends
  var legendsList = document.getElementById("legends-list");
  if(legendsList != null)
  legendsList.parentNode.removeChild(legendsList);

  // Legends to insert
  var p = document.getElementById("legends");
  var newElement = document.createElement("div");
  newElement.setAttribute("id", "legends-list");
  p.setAttribute("style", "visibility:hidden");

  if (selectedStyle === 'none') {
    city.style = defaultStyle;
  } else if (selectedStyle === 'height') {
      city.style = heightStyle;
      newElement.innerHTML = heightLegends;
      p.setAttribute("style", "visibility:visible");
  } else if (selectedStyle === 'wpd') {
      city.style = wpdStyle;
      newElement.innerHTML = wpdLegends;
      p.setAttribute("style", "visibility:visible");
  } else if (selectedStyle === 'Shape_Area') {
      city.style = areaStyle;
      newElement.innerHTML = areaLegends;
      p.setAttribute("style", "visibility:visible");
  } else if (selectedStyle === 'transparent') {
      city.style = transparentStyle;
  }

  p.appendChild(newElement);
}

tileStyle.addEventListener('change', set3DTileStyle);

// Enables overlaying of barangay boundary onto terrain
var neighborhoodsElement =  document.getElementById('neighborhoods');

neighborhoodsElement.addEventListener('change', function (e) {
  neighborhoods.show = e.target.checked;
});

// Enables modelling of shadow
var shadowsElement = document.getElementById('shadows');

shadowsElement.addEventListener('change', function (e) {
  viewer.shadows = e.target.checked;
});

/*
// Show Buildings based on Height slider
var slider = document.getElementById("slider-test");
var output = document.getElementById("slider-value");
output.innerHTML = slider.value;

slider.oninput = function() {
  output.innerHTML = this.value;
  var newStyle = city.style;

  newStyle.show = '${bxu_minus} <= ' + this.value;
  city.style = newStyle;
};
*/

// Show Buildings based on WPD slider
// Maximum WPD
var wpdSliderMax = document.getElementById("slider-wpdMax");
var wpdOutputMax = document.getElementById("slider-wpdMaxVal");
wpdOutputMax.innerHTML = wpdSliderMax.value;

wpdSliderMax.oninput = function() {
  wpdOutputMax.innerHTML = this.value;
  var newStyleWPDmax = city.style;

  newStyleWPDmax.show = '${wpd} <= ' + this.value;
  city.style = newStyleWPDmax;
};

// Minimum WPD
var wpdSliderMin = document.getElementById("slider-wpdMin");
var wpdOutputMin = document.getElementById("slider-wpdMinVal");
wpdOutputMin.innerHTML = wpdSliderMin.value;

wpdSliderMin.oninput = function() {
  wpdOutputMin.innerHTML = this.value;
  var newStyleWPDmin = city.style;

  newStyleWPDmin.show = '${wpd} >= ' + this.value;
  city.style = newStyleWPDmin;
};

// Wait for the initial city to be ready before removing the loading indicator.
var loadingIndicator = document.getElementById('loadingIndicator');
loadingIndicator.style.display = 'block';
city.readyPromise.then(function () {
  loadingIndicator.style.display = 'none';
});

