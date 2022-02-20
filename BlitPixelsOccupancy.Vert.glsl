precision highp float;
attribute vec2 TexCoord;

uniform vec2 OutputTextureSize;

//	instanced
attribute vec2 PixelPosition;
varying vec2 FragPixelPosition;

uniform sampler2D PositionsTexture;

varying float MapYNormalised;

uniform vec3 OccupancyMapWorldMin;
uniform vec3 OccupancyMapWorldMax;


vec3 GetWorldPosition()
{
	vec4 WorldPositionSample = texture2D( PositionsTexture, PixelPosition );
	return WorldPositionSample.xyz;
}

float Range(float Min,float Max,float Value)
{
	return (Value-Min) / (Max-Min);
}

float Range01(float Min,float Max,float Value)
{
	return clamp( Range( Min, Max, Value ), 0.0, 1.0 );
}


vec3 GetMapPosition(vec3 WorldPosition)
{
	vec3 WorldUv;
	WorldUv.x = Range01( OccupancyMapWorldMin.x, OccupancyMapWorldMax.x, WorldPosition.x );
	WorldUv.y = Range01( OccupancyMapWorldMin.y, OccupancyMapWorldMax.y, WorldPosition.y );
	WorldUv.z = Range01( OccupancyMapWorldMin.z, OccupancyMapWorldMax.z, WorldPosition.z );
	return WorldUv;
}


void main()
{
	vec3 WorldPosition = GetWorldPosition();
	//	turn into pixel
	
	//	TexCoord is quad-space
	vec2 TexelSize = vec2(1) / OutputTextureSize;
	
	//	normalised map pos
	vec3 MapPosition = GetMapPosition(WorldPosition);
	vec2 MapPx = floor( MapPosition.xz * OutputTextureSize );
	vec2 MapUv = MapPx * TexelSize;
	//	make it square
	MapUv += TexCoord * TexelSize;
	
	gl_Position.xy = mix( vec2(-1,-1), vec2(1,1), MapUv );
	gl_Position.z = 0.0;
	gl_Position.w = 1.0;
	
	MapYNormalised = MapPosition.y;
	
	FragPixelPosition = PixelPosition;
}

