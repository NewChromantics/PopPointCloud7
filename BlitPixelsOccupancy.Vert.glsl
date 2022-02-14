precision highp float;
attribute vec2 TexCoord;

uniform vec2 OutputTextureSize;

//	instanced
attribute vec2 PixelPosition;
varying vec2 FragPixelPosition;

uniform sampler2D PositionsTexture;

varying vec4 OutputColour;


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

const vec3 WorldMin = vec3(-5,0,0);
const vec3 WorldMax = vec3(5,2,-10);

void main()
{
	vec3 WorldPosition = GetWorldPosition();
	//	turn into pixel
	
	vec3 WorldUv;
	WorldUv.x = Range01( WorldMin.x, WorldMax.x, WorldPosition.x );
	WorldUv.y = Range01( WorldMin.y, WorldMax.y, WorldPosition.y );
	WorldUv.z = Range01( WorldMin.z, WorldMax.z, WorldPosition.z );
	
	vec2 MapPx = floor( WorldUv.xz * OutputTextureSize );
	float MapY = WorldUv.y;// * 255.0;
	
	//	TexCoord is quad-space
	vec2 TexelSize = vec2(1) / OutputTextureSize;
	
	vec2 Uv = MapPx * TexelSize;
	Uv += TexCoord * TexelSize;
	
	gl_Position.xy = mix( vec2(-1,-1), vec2(1,1), Uv );
	gl_Position.z = 0.0;
	gl_Position.w = 1.0;
	
	OutputColour = vec4(MapY);
	
	FragPixelPosition = PixelPosition;
}

