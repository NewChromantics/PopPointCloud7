precision highp float;
varying vec4 FragColour;

uniform bool MuteColour;
uniform bool InvertColour;

uniform sampler2D DepthTexture;
uniform mat4 NormalDepthToViewDepthTransform;
uniform mat4 CameraToWorldTransform;
uniform mat4 ProjectionToCameraTransform;

varying vec3 FragWorldPosition;
varying vec2 FragLocalUv;
varying vec3 FragLocalPosition;
varying vec2 FragViewUv;
varying vec3 ClipPosition;
varying vec3 FragWorldNormal;

varying vec3 FragCameraPosition;

uniform sampler2D OccupancyMapTexture;
uniform vec2 OccupancyMapTextureSize;
uniform vec3 OccupancyMapWorldMin;
uniform vec3 OccupancyMapWorldMax;

float Range(float Min,float Max,float Value)
{
	return (Value-Min) / (Max-Min);
}

float Range01(float Min,float Max,float Value)
{
	return clamp( Range( Min, Max, Value ), 0.0, 1.0 );
}

bool Inside01(float f)
{
	return (f>0.0)&&(f<1.0);
}

vec3 GetMapPosition(vec3 WorldPosition,out bool Inside)
{
	vec3 WorldUv;
	WorldUv.x = Range01( OccupancyMapWorldMin.x, OccupancyMapWorldMax.x, WorldPosition.x );
	WorldUv.y = Range01( OccupancyMapWorldMin.y, OccupancyMapWorldMax.y, WorldPosition.y );
	WorldUv.z = Range01( OccupancyMapWorldMin.z, OccupancyMapWorldMax.z, WorldPosition.z );
	
	Inside = Inside01(WorldUv.x) && Inside01(WorldUv.y) && Inside01(WorldUv.z);
	return WorldUv;
}

const int YSectionsPerComponent = 5;
const int YSectionComponents = 4;
#define YSectionCount	(YSectionsPerComponent*YSectionComponents)

#define WorldSectionSizeY	( ( OccupancyMapWorldMax.y - OccupancyMapWorldMin.y ) / float(YSectionCount) )

vec4 GetOccupancySample(vec3 WorldPosition,out float MapPositionYNormalised)
{
	bool Inside;
	vec3 MapPosition = GetMapPosition(WorldPosition,Inside);
	if ( !Inside )	return vec4(0);
	vec2 MapPx = floor( MapPosition.xz * OccupancyMapTextureSize );
	vec2 TexelSize = vec2(1) / OccupancyMapTextureSize;
	vec2 MapUv = MapPx * TexelSize;
	
	MapPositionYNormalised = MapPosition.y;
	
	vec4 OccupancyData = texture2D( OccupancyMapTexture, MapUv );
	return OccupancyData;
}

float GetSectionValue(int Section)
{
	//	pow(10,0)==1 ??
	return pow( 10.0, float(Section) );
	if ( Section == 0 )		return 1.0;
	if ( Section == 1 )		return 10.0;
	if ( Section == 2 )		return 100.0;
	if ( Section == 3 )		return 1000.0;
	if ( Section == 4 )		return 10000.0;
	if ( Section == 5 )		return 100000.0;
	if ( Section == 6 )		return 1000000.0;
	if ( Section == 7 )		return 10000000.0;
	if ( Section == 8 )		return 100000000.0;
	if ( Section == 9 )		return 1000000000.0;
	if ( Section == 10 )	return 10000000000.0;
	if ( Section == 11 )	return 100000000000.0;
	return 0.0;
}

bool HasHitInOccupancyData(vec4 OccupancyData,int Section)
{
	int Component = int(Section) / YSectionsPerComponent;
	float CompSection = mod( float(Section), float(YSectionsPerComponent) );
	float CompSectionValue = GetSectionValue(int(CompSection));
	
	float Data = 0.0;
	Data += ( Component == 0) ? OccupancyData.x : 0.0;
	Data += ( Component == 1) ? OccupancyData.y : 0.0;
	Data += ( Component == 2) ? OccupancyData.z : 0.0;
	Data += ( Component == 3) ? OccupancyData.w : 0.0;
	
	//	turn 400000 into 4 into != 0
	Data = floor( Data / CompSectionValue );
	Data = mod( Data, 10.0 );
	
	//	0.99 to deal with possible floating point resolution (as seen in read-back floats)
	return Data >= 0.99;
}	

#define MaxShadowDistance	(0.7)

float GetOccupancyMapShadowFactor(vec3 WorldPosition)
{
	//	get our position in the occupancy map
	float MapYNormalised;
	vec4 OccupancyData = GetOccupancySample(WorldPosition,MapYNormalised);

	//	from blit occupancy frag
	float Section = floor(MapYNormalised * float(YSectionCount) );
	
	//	walk upwards until we hit data
	for ( int TestSection=0;	TestSection<YSectionCount;	TestSection++ )
	{
		if ( TestSection <= int(Section) )
			continue;
			
		//	is there data here
		bool Hit = HasHitInOccupancyData( OccupancyData, TestSection );
		if ( Hit )
		{
			float SectionsAway = float(TestSection) - Section;
			float DistanceAway = WorldSectionSizeY * SectionsAway;
			float Strength = 1.0 - clamp( DistanceAway / MaxShadowDistance, 0.0, 1.0 );
			return Strength;
		}
	}
	return 0.0;
}


const float ValueToMetres = 0.0010000000474974513;

float GetViewDepth()
{
	//	view uv (-1...1) to 0...1
	vec2 UvNormalised = (FragViewUv + 1.0) / 2.0;

	//	texture is rotated
	//	would be nice to fix this in upload, but really should be part of the transform
	//UvNormalised = vec2( 1.0-UvNormalised.y, 1.0-UvNormalised.x );
	UvNormalised = vec2( UvNormalised.x, 1.0 - UvNormalised.y );

	//	gr: I think this is correct - do a projection correction for screen->depth texture
	//		to get proper coords
	vec4 DepthUv4 = NormalDepthToViewDepthTransform * vec4( UvNormalised, 0.0, 1.0 );
	vec2 DepthUv = DepthUv4.xy;

	
	float Depth = texture2D( DepthTexture, DepthUv ).x;
	Depth *= ValueToMetres;
	return Depth;
}


vec3 GetSceneCameraPosition()
{
	//	depth in viewport space so 0...1, leave it at that
	vec2 xy = ClipPosition.xy;
	vec2 uv = (xy + 1.0 ) / 2.0;	//	0...1
	
	//	this depth needs to be normalised to be in camera projection space...
	//float Depth = texture2D(SceneDepthTexture, uv).x;	//	already 0...1
	float Depth = 1.0;

	vec3 xyz = mix( vec3(-1,-1,-1), vec3(1,1,1), vec3(uv,Depth) );
	vec4 ProjectionPos = vec4( xyz, 1 );
	
	vec4 CameraPos = ProjectionToCameraTransform * ProjectionPos;
	vec3 CameraPos3 = CameraPos.xyz / CameraPos.www;
	
	//	CameraPos3 is end of ray
	float ViewDepthMetres = GetViewDepth();
	CameraPos3 = normalize(CameraPos3);
	CameraPos3 *= ViewDepthMetres;
	
	return CameraPos3;
}

vec3 GetSceneWorldPosition()
{
	vec3 CameraPos = GetSceneCameraPosition();
	vec4 WorldPos = CameraToWorldTransform * vec4(CameraPos,1);
	vec3 WorldPos3 = WorldPos.xyz / WorldPos.www;
	return WorldPos3;
}

float Fresnel(vec3 eyeVector, vec3 worldNormal)
{
	const float FresnelFactor = 3.0;
	return pow( 1.0 + dot( eyeVector, worldNormal), FresnelFactor );
}

const vec3 LightWorldPosition = vec3(1,10,0);


float PhongLightFactor()
{
	//	Y is backwards here...
	vec3 DirToLight = normalize(LightWorldPosition - FragWorldPosition);
	float Dot = dot( FragWorldNormal, DirToLight );
	Dot = Range( -1.0, 1.0, Dot );
	return Dot;
}

#define GENERATE_ADDITIONAL_SHADOW	false

vec3 ApplyLighting(vec3 Colour)
{
	float Light = PhongLightFactor();
	
	//	sample just a tiny bit away from the surface
	vec3 ShadowSamplePosition = FragWorldPosition + (FragWorldNormal*0.015);
	float Shadow = GetOccupancyMapShadowFactor( ShadowSamplePosition );
	
	if ( GENERATE_ADDITIONAL_SHADOW )
	{
		//	we should really walk towards LightWorldPosition
		//	for some basic GI
		//	get neighbour shadowing. if facing Z we want -1,1	0,1	
		float ZFactor = dot( FragWorldNormal, vec3(0,0,1) );
		float XFactor = dot( FragWorldNormal, vec3(1,0,0) );
		float StepAway = 0.14;	//	should probably be an occupany map-away
		vec3 Left = cross( FragWorldNormal, vec3(0,1,0) ) * StepAway;
		vec3 Right = -Left;
		vec3 Forward = FragWorldNormal * StepAway;
		float Shadow0 = GetOccupancyMapShadowFactor( FragWorldPosition + Forward + Left );
		//float Shadow1 = GetOccupancyMapShadowFactor( FragWorldPosition + Forward );
		float Shadow1 = 0.0;
		float Shadow2 = GetOccupancyMapShadowFactor( FragWorldPosition + Forward + Right );

		float Shadow012 = Shadow0 + Shadow1 + Shadow2;
		Shadow += Shadow012 * 0.30;
	}
	else
	{
		Shadow *= 1.4;
	}
	Light *= 1.0 - Shadow;
	Light = clamp( Light, 0.0, 1.0 );

	vec3 DarkColour = Colour - vec3(0.5);	
	vec3 LightColour = Colour + vec3(0.5);
	Colour = mix( DarkColour, LightColour, Light );	
	return Colour;
}


void main()
{
	gl_FragColor.w = 1.0;
	
	#define HAS_DEPTH	false
	if ( !HAS_DEPTH )
	{
		gl_FragColor = FragColour;
		//gl_FragColor.xyz = vec3(0.6,0.7,0.7);
		gl_FragColor.xyz = ApplyLighting( gl_FragColor.xyz );

		return;
	}
	
	vec4 BEHIND_COLOUR = vec4(1,0,0,0.1);
	vec4 INFRONT_COLOUR = vec4(FragLocalUv,0,1);
	/*
	vec4 CameraWorldPosition4 = CameraToWorldTransform * vec4(0,0,0,1);
	vec3 CameraWorldPosition = CameraWorldPosition4.xyz / CameraWorldPosition4.www;
	vec3 SceneWorldPosition = GetSceneWorldPosition();
	
	float DistanceToFrag = length(WorldPosition-CameraWorldPosition);
	float DistanceToRealWorld = length(SceneWorldPosition-CameraWorldPosition);
	*/

	float FragDistance = -FragCameraPosition.z;
	float RealDistance = GetViewDepth();
	gl_FragColor.xyz = vec3(FragDistance,0.0,RealDistance);
	
	if ( FragDistance < 0.001 )
		gl_FragColor = vec4(1,1,0,1);
	if ( FragDistance < 0.0 )
		gl_FragColor = vec4(0,1,1,1);

	if ( FragDistance < RealDistance )
	{
		gl_FragColor = INFRONT_COLOUR;
		gl_FragColor.xyz *= RealDistance;
	}
	else
	{
		gl_FragColor = BEHIND_COLOUR;
		gl_FragColor.xyz *= RealDistance;
		discard;
	}

	/*
	//	clipped by scene
	//	gr: tolerance so we dont clip when rendering the scene test billboards
	float Tolerance = 0.0001;
	if ( SceneCameraPosition.z+Tolerance < CameraPosition.z )
	{
		gl_FragColor = vec4(1,0,0,1);
		discard;
		return;
	}
	
	if ( WorldPosition

	gl_FragColor = vec4( Colour.xyz, 1 );

	if ( MuteColour )
		gl_FragColor.xyz = Colour.xxx;
	else if ( InvertColour )
		gl_FragColor.xyz = Colour.zxy;
	
	float Depth = GetWorldDepth();
	gl_FragColor.xyz = vec3(Depth,Depth,Depth);
	*/
}


